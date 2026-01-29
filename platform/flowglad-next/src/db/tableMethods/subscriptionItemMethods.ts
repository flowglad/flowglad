/**
 * Subscription item table methods.
 *
 * NOTE: Server-only functions (selectRichSubscriptionsAndActiveItems, expireSubscriptionItems,
 * selectSubscriptionItemsWithPricesBySubscriptionId/s) are in subscriptionItemMethods.server.ts
 * to avoid pulling server dependencies into client bundles.
 */

import {
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
  createDateNotPassedFilter,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@db-core/tableUtils'
import { and, eq, inArray, lte } from 'drizzle-orm'
import {
  type SubscriptionItem,
  subscriptionItems,
  subscriptionItemsInsertSchema,
  subscriptionItemsSelectSchema,
  subscriptionItemsUpdateSchema,
} from '@/db/schema/subscriptionItems'
import type { DbTransaction } from '@/db/types'
import {
  type Subscription,
  subscriptions,
  subscriptionsSelectSchema,
} from '../schema/subscriptions'
import {
  derivePricingModelIdFromSubscription,
  pricingModelIdsForSubscriptions,
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
    async (id, transaction) => {
      const result = await selectSubscriptionItemById(id, transaction)
      return result.unwrap()
    }
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

const baseBulkInsertOrDoNothingSubscriptionItems =
  createBulkInsertOrDoNothingFunction(subscriptionItems, config)

const bulkInsertOrDoNothingSubscriptionItems = async (
  subscriptionItemInserts: SubscriptionItem.Insert[],
  conflictColumns: Parameters<
    typeof baseBulkInsertOrDoNothingSubscriptionItems
  >[1],
  transaction: DbTransaction
) => {
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
        lte(
          subscriptionItems.addedDate,
          new Date(anchorDate).getTime()
        ),
        createDateNotPassedFilter(
          subscriptionItems.expiredAt,
          anchorDate
        )
      )
    )

  return result.map((row) => subscriptionItemsSelectSchema.parse(row))
}

/**
 * Selects all subscription items including scheduled future items.
 * Unlike selectCurrentlyActiveSubscriptionItems which only returns items active at a point in time,
 * this function returns all items that haven't expired, including those scheduled to start in the future.
 */
export const selectSubscriptionItemsIncludingScheduled = async (
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
        createDateNotPassedFilter(
          subscriptionItems.expiredAt,
          anchorDate
        )
      )
    )

  return result.map((row) => subscriptionItemsSelectSchema.parse(row))
}
