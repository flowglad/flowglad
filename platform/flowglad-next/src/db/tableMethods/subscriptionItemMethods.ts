import { and, eq, inArray, lte } from 'drizzle-orm'
import {
  type SubscriptionItem,
  subscriptionItems,
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemsUpdateSchema,
} from '@/db/schema/subscriptionItems'
import {
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import {
  type RichSubscription,
  richSubscriptionClientSelectSchema,
} from '@/subscriptions/schemas'
import type { SubscriptionStatus } from '@/types'
import core from '@/utils/core'
import {
  type Price,
  prices,
  pricesClientSelectSchema,
} from '../schema/prices'
import {
  type Subscription,
  subscriptions,
  subscriptionsSelectSchema,
} from '../schema/subscriptions'
import { createDateNotPassedFilter } from '../tableUtils'
import { selectUsageMeterBalancesForSubscriptions } from './ledgerEntryMethods'
import {
  expireSubscriptionItemFeaturesForSubscriptionItems,
  selectSubscriptionItemFeaturesWithFeatureSlug,
} from './subscriptionItemFeatureMethods'
import {
  derivePricingModelIdFromSubscription,
  isSubscriptionCurrent,
  pricingModelIdsForSubscriptions,
  selectSubscriptions,
  selectSubscriptionsByCustomerIdCached,
} from './subscriptionMethods'

const config: ORMMethodCreatorConfig<
  typeof subscriptionItems,
  typeof subscriptionItemsSelectSchema,
  typeof subscriptionItemsInsertSchema,
  typeof subscriptionItemsUpdateSchema
> = {
  selectSchema: subscriptionItemsSelectSchema,
  insertSchema: subscriptionItemsInsertSchema,
  updateSchema: subscriptionItemsUpdateSchema,
  tableName: 'subscription_items',
}

export const selectSubscriptionItemById = createSelectById(
  subscriptionItems,
  config
)

/**
 * Derives pricingModelId from a subscription item.
 * Used for subscription item inserts.
 */
export const derivePricingModelIdFromSubscriptionItem =
  createDerivePricingModelId(
    subscriptionItems,
    config,
    selectSubscriptionItemById
  )

/**
 * Batch derives pricingModelIds from multiple subscription items.
 * More efficient than calling derivePricingModelIdFromSubscriptionItem individually.
 */
export const derivePricingModelIdsFromSubscriptionItems =
  createDerivePricingModelIds(subscriptionItems, config)

const baseInsertSubscriptionItem = createInsertFunction(
  subscriptionItems,
  config
)

export const insertSubscriptionItem = async (
  subscriptionItemInsert: SubscriptionItem.Insert,
  transaction: DbTransaction
): Promise<SubscriptionItem.Record> => {
  const pricingModelId = subscriptionItemInsert.pricingModelId
    ? subscriptionItemInsert.pricingModelId
    : await derivePricingModelIdFromSubscription(
        subscriptionItemInsert.subscriptionId,
        transaction
      )
  return baseInsertSubscriptionItem(
    {
      ...subscriptionItemInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateSubscriptionItem = createUpdateFunction(
  subscriptionItems,
  config
)

export const selectSubscriptionItems = createSelectFunction(
  subscriptionItems,
  config
)

const baseBulkInsertSubscriptionItems = createBulkInsertFunction(
  subscriptionItems,
  config
)

export const bulkInsertSubscriptionItems = async (
  subscriptionItemInserts: SubscriptionItem.Insert[],
  transaction: DbTransaction
): Promise<SubscriptionItem.Record[]> => {
  const subscriptionIds = Array.from(
    new Set(
      subscriptionItemInserts.map((insert) => insert.subscriptionId)
    )
  )
  const pricingModelIdMap = await pricingModelIdsForSubscriptions(
    subscriptionIds,
    transaction
  )
  const subscriptionItemsWithPricingModelId =
    subscriptionItemInserts.map(
      (subscriptionItemInsert): SubscriptionItem.Insert => {
        const pricingModelId =
          subscriptionItemInsert.pricingModelId ??
          pricingModelIdMap.get(subscriptionItemInsert.subscriptionId)
        if (!pricingModelId) {
          throw new Error(
            `Pricing model id not found for subscription ${subscriptionItemInsert.subscriptionId}`
          )
        }
        return {
          ...subscriptionItemInsert,
          pricingModelId,
        }
      }
    )
  return baseBulkInsertSubscriptionItems(
    subscriptionItemsWithPricingModelId,
    transaction
  )
}

export const selectSubscriptionAndItems = async (
  whereClause: SelectConditions<typeof subscriptions>,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      subscriptionItems: subscriptionItems,
      subscription: subscriptions,
    })
    .from(subscriptionItems)
    .innerJoin(
      subscriptions,
      eq(subscriptionItems.subscriptionId, subscriptions.id)
    )
    .where(whereClauseFromObject(subscriptions, whereClause))

  if (!result.length) {
    return null
  }

  const subscription = subscriptionsSelectSchema.parse(
    result[0].subscription
  )

  const subscriptionItemsResults = result.map((row) =>
    subscriptionItemsSelectSchema.parse(row.subscriptionItems)
  )

  return {
    subscription,
    subscriptionItems: subscriptionItemsResults,
  }
}

export const selectSubscriptionItemsAndSubscriptionBySubscriptionId =
  async (subscriptionId: string, transaction: DbTransaction) => {
    return selectSubscriptionAndItems(
      {
        id: subscriptionId,
      },
      transaction
    )
  }

export const bulkCreateOrUpdateSubscriptionItems = async (
  subscriptionItemUpdates: (
    | SubscriptionItem.Insert
    | SubscriptionItem.Update
  )[],
  transaction: DbTransaction
) => {
  const itemsWithIds = subscriptionItemUpdates.filter(
    (item) => 'id' in item
  ) as SubscriptionItem.Update[]
  const itemsWithoutIds = subscriptionItemUpdates.filter(
    (item) => !('id' in item)
  ) as SubscriptionItem.Insert[]

  // Verify all items exist before attempting to update them
  if (itemsWithIds.length > 0) {
    const existingItems = await transaction
      .select({ id: subscriptionItems.id })
      .from(subscriptionItems)
      .where(
        inArray(
          subscriptionItems.id,
          itemsWithIds.map((item) => item.id)
        )
      )

    const existingIds = new Set(existingItems.map((item) => item.id))
    for (const item of itemsWithIds) {
      if (!existingIds.has(item.id)) {
        throw new Error(
          `Cannot update subscription item with id ${item.id} because it is non-existent`
        )
      }
    }
  }

  const createdItems = await bulkInsertOrDoNothingSubscriptionItems(
    itemsWithoutIds,
    [subscriptionItems.id],
    transaction
  )

  const updatedItems = await Promise.all(
    itemsWithIds.map((item) => {
      return updateSubscriptionItem(item, transaction)
    })
  )

  return [...createdItems, ...updatedItems]
}

export const expireSubscriptionItems = async (
  subscriptionItemIds: string[],
  expiredAt: Date | number,
  transaction: DbTransaction
) => {
  const result = await transaction
    .update(subscriptionItems)
    .set({
      expiredAt: new Date(expiredAt).getTime(),
    })
    .where(inArray(subscriptionItems.id, subscriptionItemIds))
  await expireSubscriptionItemFeaturesForSubscriptionItems(
    subscriptionItemIds,
    new Date(expiredAt).getTime(),
    transaction
  )
  return subscriptionItemsSelectSchema.array().parse(result)
}

/**
 * Selects subscription items with their associated prices for the given subscription IDs.
 * This is a decomposed query that can be cached independently.
 *
 * @param subscriptionIds - Array of subscription IDs to fetch items for
 * @param transaction - Database transaction
 * @returns Array of subscription items with their prices
 */
export const selectSubscriptionItemsWithPricesBySubscriptionIds =
  async (subscriptionIds: string[], transaction: DbTransaction) => {
    if (subscriptionIds.length === 0) {
      return []
    }

    const rows = await transaction
      .select({
        subscriptionItem: subscriptionItems,
        price: prices,
      })
      .from(subscriptionItems)
      .leftJoin(prices, eq(subscriptionItems.priceId, prices.id))
      .where(
        inArray(subscriptionItems.subscriptionId, subscriptionIds)
      )

    return rows.map((row) => ({
      subscriptionItem: subscriptionItemsSelectSchema.parse(
        row.subscriptionItem
      ),
      price: row.price
        ? pricesClientSelectSchema.parse(row.price)
        : null,
    }))
  }

/**
 * Processes subscription and item data to build the rich subscriptions map.
 * This helper function handles:
 * 1. Creating subscription entries with their current status
 * 2. Adding active subscription items with their associated prices
 *
 * @param subscriptionRecords - Array of subscription records
 * @param itemsWithPrices - Array of subscription items with their prices
 * @returns Map of subscription IDs to their rich subscription objects
 */
const buildRichSubscriptionsMap = (
  subscriptionRecords: Subscription.Record[],
  itemsWithPrices: {
    subscriptionItem: SubscriptionItem.Record
    price: Price.ClientRecord | null
  }[]
): Map<string, RichSubscription> => {
  const richSubscriptionsMap = new Map<string, RichSubscription>()

  // Initialize all subscriptions
  for (const subscription of subscriptionRecords) {
    richSubscriptionsMap.set(subscription.id, {
      ...subscription,
      current: isSubscriptionCurrent(
        subscription.status as SubscriptionStatus,
        subscription.cancellationReason
      ),
      subscriptionItems: [],
    })
  }

  // Add active subscription items to their subscriptions
  for (const { subscriptionItem, price } of itemsWithPrices) {
    if (!isSubscriptionItemActive(subscriptionItem)) {
      continue
    }
    if (!price) {
      continue
    }
    const subscription = richSubscriptionsMap.get(
      subscriptionItem.subscriptionId
    )
    if (subscription) {
      subscription.subscriptionItems.push({
        ...subscriptionItem,
        price,
      })
    }
  }

  return richSubscriptionsMap
}

/**
 * Determines if a subscription item is currently active based on its expiry date.
 * An item is active if it has no expiry date or if the expiry date is in the future.
 */
const isSubscriptionItemActive = (item: {
  expiredAt?: number | null
}): boolean => {
  return !item.expiredAt || item.expiredAt > Date.now()
}

/**
 * Fetches subscriptions with their active items, features, and usage meter balances.
 * This function performs decomposed queries that can be cached independently.
 *
 * @param whereConditions - Conditions to filter the subscriptions
 * @param transaction - Database transaction to use for all queries
 * @param livemode - Required for caching - must match the transaction's livemode context
 * @returns Array of rich subscriptions with their active items, features, and meter balances
 */
export const selectRichSubscriptionsAndActiveItems = async (
  whereConditions: SelectConditions<typeof subscriptions>,
  transaction: DbTransaction,
  livemode: boolean
): Promise<RichSubscription[]> => {
  // Step 1: Fetch subscriptions - use cache if querying by single customerId string
  let subscriptionRecords: Subscription.Record[]

  const customerId = whereConditions.customerId
  if (
    typeof customerId === 'string' &&
    Object.keys(whereConditions).length === 1
  ) {
    subscriptionRecords = await selectSubscriptionsByCustomerIdCached(
      customerId,
      transaction,
      livemode
    )
  } else {
    subscriptionRecords = await selectSubscriptions(
      whereConditions,
      transaction
    )
  }

  const subscriptionIds = subscriptionRecords.map((s) => s.id)

  if (subscriptionIds.length === 0) {
    return []
  }

  // Step 2: Fetch subscription items with prices (cacheable by subscription IDs)
  const itemsWithPrices =
    await selectSubscriptionItemsWithPricesBySubscriptionIds(
      subscriptionIds,
      transaction
    )

  // Step 3: Build the rich subscriptions map
  const richSubscriptionsMap = buildRichSubscriptionsMap(
    subscriptionRecords,
    itemsWithPrices
  )

  // Step 4: Prepare active subscription items for feature lookup
  const activeSubscriptionItems = itemsWithPrices
    .filter(({ subscriptionItem }) =>
      isSubscriptionItemActive(subscriptionItem)
    )
    .map(({ subscriptionItem }) => subscriptionItem)

  // Step 5: Fetch related data in parallel for better performance
  const [allSubscriptionItemFeatures, usageMeterBalances] =
    await Promise.all([
      selectSubscriptionItemFeaturesWithFeatureSlug(
        {
          subscriptionItemId: activeSubscriptionItems.map(
            (item) => item.id
          ),
        },
        transaction
      ),
      selectUsageMeterBalancesForSubscriptions(
        { subscriptionId: subscriptionIds },
        transaction
      ),
    ])

  // Step 6: Filter out expired subscription item features
  const subscriptionItemFeatures = allSubscriptionItemFeatures.filter(
    (f) => !f.expiredAt || f.expiredAt > Date.now()
  )

  // Step 7: Group features and meter balances by subscription ID
  const subscriptionItemsById = core.groupBy(
    (item) => item.id,
    activeSubscriptionItems
  )
  const featuresBySubscriptionId = core.groupBy((feature) => {
    const subscriptionItem =
      subscriptionItemsById[feature.subscriptionItemId]?.[0]
    if (!subscriptionItem)
      throw new Error('Subscription item not found')
    return subscriptionItem.subscriptionId
  }, subscriptionItemFeatures)
  const meterBalancesBySubscriptionId = core.groupBy(
    (item) => item.subscriptionId,
    usageMeterBalances
  )

  // Step 8: Combine all data into rich subscriptions
  const richSubscriptions = Array.from(
    richSubscriptionsMap.values()
  ).map((subscription) => ({
    ...subscription,
    experimental: {
      usageMeterBalances:
        meterBalancesBySubscriptionId[subscription.id]?.map(
          (item) => item.usageMeterBalance
        ) ?? [],
      featureItems: featuresBySubscriptionId[subscription.id] ?? [],
    },
  }))

  // Step 9: Validate and return the final result
  return richSubscriptions.map((item) =>
    richSubscriptionClientSelectSchema.parse(item)
  )
}

const baseBulkInsertOrDoNothingSubscriptionItems =
  createBulkInsertOrDoNothingFunction(subscriptionItems, config)

const bulkInsertOrDoNothingSubscriptionItems = async (
  subscriptionItemInserts: SubscriptionItem.Insert[],
  conflictColumns: Parameters<
    typeof baseBulkInsertOrDoNothingSubscriptionItems
  >[1],
  transaction: DbTransaction
) => {
  // Derive pricingModelId if not provided
  const subscriptionIds = Array.from(
    new Set(
      subscriptionItemInserts.map((insert) => insert.subscriptionId)
    )
  )
  const pricingModelIdMap = await pricingModelIdsForSubscriptions(
    subscriptionIds,
    transaction
  )
  const insertsWithPricingModelId = subscriptionItemInserts.map(
    (insert): SubscriptionItem.Insert => {
      const pricingModelId =
        insert.pricingModelId ??
        pricingModelIdMap.get(insert.subscriptionId)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for subscription ${insert.subscriptionId}`
        )
      }
      return {
        ...insert,
        pricingModelId,
      }
    }
  )
  return baseBulkInsertOrDoNothingSubscriptionItems(
    insertsWithPricingModelId,
    conflictColumns,
    transaction
  )
}

export const bulkInsertOrDoNothingSubscriptionItemsByExternalId = (
  subscriptionItemInserts: SubscriptionItem.Insert[],
  transaction: DbTransaction
) => {
  return bulkInsertOrDoNothingSubscriptionItems(
    subscriptionItemInserts,
    [subscriptionItems.externalId],
    transaction
  )
}

export const selectCurrentlyActiveSubscriptionItems = async (
  whereConditions: SelectConditions<typeof subscriptionItems>,
  anchorDate: Date | number,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(subscriptionItems)
    .where(
      and(
        whereClauseFromObject(subscriptionItems, whereConditions),
        // Item must have started (addedDate <= anchorDate)
        lte(
          subscriptionItems.addedDate,
          new Date(anchorDate).getTime()
        ),
        // Item must not have expired (expiredAt is null OR expiredAt > anchorDate)
        createDateNotPassedFilter(
          subscriptionItems.expiredAt,
          anchorDate
        )
      )
    )

  return result.map((row) => subscriptionItemsSelectSchema.parse(row))
}
