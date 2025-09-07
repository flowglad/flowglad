import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkInsertFunction,
  createBulkUpsertFunction,
  SelectConditions,
  whereClauseFromObject,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  SubscriptionItem,
  subscriptionItems,
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemsUpdateSchema,
} from '@/db/schema/subscriptionItems'
import { DbTransaction } from '@/db/types'
import {
  subscriptions,
  subscriptionsSelectSchema,
} from '../schema/subscriptions'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import {
  RichSubscription,
  richSubscriptionClientSelectSchema,
  RichSubscriptionItem,
} from '@/subscriptions/schemas'
import {
  pricesClientSelectSchema,
  subscribablePriceClientSelectSchema,
} from '../schema/prices'
import { prices } from '../schema/prices'
import { isSubscriptionCurrent } from './subscriptionMethods'
import { SubscriptionItemType, SubscriptionStatus } from '@/types'
import {
  expireSubscriptionItemFeaturesForSubscriptionItem,
  selectSubscriptionItemFeatures,
  selectSubscriptionItemFeaturesWithFeatureSlug,
} from './subscriptionItemFeatureMethods'
import { selectUsageMeterBalancesForSubscriptions } from './ledgerEntryMethods'
import core from '@/utils/core'

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

export const insertSubscriptionItem = createInsertFunction(
  subscriptionItems,
  config
)

export const updateSubscriptionItem = createUpdateFunction(
  subscriptionItems,
  config
)

export const selectSubscriptionItems = createSelectFunction(
  subscriptionItems,
  config
)

export const bulkInsertSubscriptionItems = createBulkInsertFunction(
  subscriptionItems,
  config
)

const innerBulkCreateOrDoNothingSubscriptionItems =
  createBulkInsertOrDoNothingFunction(subscriptionItems, config)

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

export const expireSubscriptionItem = async (
  subscriptionItemId: string,
  expiredAt: Date,
  transaction: DbTransaction
) => {
  const subscriptionItem = await selectSubscriptionItemById(
    subscriptionItemId,
    transaction
  )
  if (subscriptionItem.type === SubscriptionItemType.Usage) {
    throw new Error('Usage items cannot be expired')
  }
  await updateSubscriptionItem(
    {
      id: subscriptionItemId,
      expiredAt,
      type: subscriptionItem.type,
      usageMeterId: subscriptionItem.usageMeterId,
      usageEventsPerUnit: subscriptionItem.usageEventsPerUnit,
    },
    transaction
  )
  await expireSubscriptionItemFeaturesForSubscriptionItem(
    subscriptionItemId,
    expiredAt,
    transaction
  )
}

/**
 * Processes a single row from the subscription query result, updating the rich subscriptions map.
 * This helper function handles:
 * 1. Creating a new subscription entry if it doesn't exist
 * 2. Adding active subscription items with their associated prices
 *
 * @param row - The database row containing subscription, item, and price data
 * @param richSubscriptionsMap - Map of subscription IDs to their rich subscription objects
 */
const processSubscriptionRow = (
  row: {
    subscription: typeof subscriptions.$inferSelect | null
    subscriptionItems: typeof subscriptionItems.$inferSelect | null
    price: typeof prices.$inferSelect | null
  },
  richSubscriptionsMap: Map<string, RichSubscription>
): void => {
  const subscriptionId = row.subscription?.id
  if (!subscriptionId) return

  // Initialize subscription if not exists
  if (!richSubscriptionsMap.has(subscriptionId)) {
    richSubscriptionsMap.set(subscriptionId, {
      ...subscriptionsSelectSchema.parse(row.subscription),
      current: isSubscriptionCurrent(
        row.subscription?.status as SubscriptionStatus,
        row.subscription?.cancellationReason
      ),
      subscriptionItems: [],
    })
  }

  // Add active subscription item if exists
  if (
    row.subscriptionItems &&
    isSubscriptionItemActive(row.subscriptionItems)
  ) {
    const price = row.price
      ? subscribablePriceClientSelectSchema.parse(row.price)
      : undefined
    if (price) {
      richSubscriptionsMap
        .get(subscriptionId)
        ?.subscriptionItems.push({
          ...subscriptionItemsSelectSchema.parse(
            row.subscriptionItems
          ),
          price,
        })
    }
  }
}

/**
 * Determines if a subscription item is currently active based on its expiry date.
 * An item is active if it has no expiry date or if the expiry date is in the future.
 */
const isSubscriptionItemActive = (
  item: typeof subscriptionItems.$inferSelect
): boolean => {
  return !item.expiredAt || item.expiredAt > new Date()
}

/**
 * Fetches subscriptions with their active items, features, and usage meter balances.
 * This function performs a comprehensive query to get all subscription-related data in a single call.
 *
 * The function follows these steps:
 * 1. Fetches subscriptions with their items and prices using a LEFT JOIN to include subscriptions without items
 * 2. Processes the results to create a map of rich subscriptions with their active items
 * 3. Fetches related data (features and meter balances) in parallel for better performance
 * 4. Combines all data into the final rich subscription objects
 *
 * @param whereConditions - Conditions to filter the subscriptions
 * @param transaction - Database transaction to use for all queries
 * @returns Array of rich subscriptions with their active items, features, and meter balances
 */
export const selectRichSubscriptionsAndActiveItems = async (
  whereConditions: SelectConditions<typeof subscriptions>,
  transaction: DbTransaction
): Promise<RichSubscription[]> => {
  // Step 1: Fetch subscriptions with their items and prices
  // Uses LEFT JOIN to include subscriptions even if they have no items
  const rows = await transaction
    .select({
      subscriptionItems,
      subscription: subscriptions,
      price: prices,
    })
    .from(subscriptions)
    .leftJoin(
      subscriptionItems,
      eq(subscriptionItems.subscriptionId, subscriptions.id)
    )
    .leftJoin(prices, eq(subscriptionItems.priceId, prices.id))
    .where(whereClauseFromObject(subscriptions, whereConditions))

  // Step 2: Process subscriptions and their items
  // Creates a map of subscription IDs to their rich subscription objects
  const richSubscriptionsMap = rows.reduce((acc, row) => {
    processSubscriptionRow(row, acc)
    return acc
  }, new Map<string, RichSubscription>())

  const subscriptionIds = Array.from(richSubscriptionsMap.keys())

  // Step 3: Prepare active subscription items for feature lookup
  // Filters out expired items and null values
  const activeSubscriptionItems = rows
    .filter(
      (row) =>
        row.subscriptionItems &&
        isSubscriptionItemActive(row.subscriptionItems)
    )
    .map((row) => row.subscriptionItems)
    .filter((item): item is NonNullable<typeof item> => item !== null)

  // Step 4: Fetch related data in parallel for better performance
  // Gets features and meter balances in a single Promise.all call
  const [subscriptionItemFeatures, usageMeterBalances] =
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

  // Step 5: Group features by subscription ID
  // Creates lookup maps for efficient data access
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

  // Step 6: Group meter balances by subscription ID
  const meterBalancesBySubscriptionId = core.groupBy(
    (item) => item.subscriptionId,
    usageMeterBalances
  )

  // Step 7: Combine all data into rich subscriptions
  // Maps the data into the final rich subscription format
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

  // Step 8: Validate and return the final result
  return richSubscriptions.map((item) =>
    richSubscriptionClientSelectSchema.parse(item)
  )
}

const bulkInsertOrDoNothingSubscriptionItems =
  createBulkInsertOrDoNothingFunction(subscriptionItems, config)

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
  anchorDate: Date,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(subscriptionItems)
    .where(
      and(
        whereClauseFromObject(subscriptionItems, whereConditions),
        or(
          isNull(subscriptionItems.expiredAt),
          gt(subscriptionItems.expiredAt, anchorDate)
        )
      )
    )

  return result.map((row) => subscriptionItemsSelectSchema.parse(row))
}
