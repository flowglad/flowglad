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
import { pricesClientSelectSchema } from '../schema/prices'
import { prices } from '../schema/prices'
import { isSubscriptionCurrent } from './subscriptionMethods'
import { SubscriptionItemType, SubscriptionStatus } from '@/types'
import { expireSubscriptionItemFeaturesForSubscriptionItem } from './subscriptionItemFeatureMethods'

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

export const selectRichSubscriptionsAndActiveItems = async (
  whereConditions: SelectConditions<typeof subscriptions>,
  transaction: DbTransaction
): Promise<RichSubscription[]> => {
  const result = await transaction
    .select({
      subscriptionItems: subscriptionItems,
      subscription: subscriptions,
      price: prices,
    })
    .from(subscriptionItems)
    .leftJoin(
      subscriptions,
      eq(subscriptionItems.subscriptionId, subscriptions.id)
    )
    .innerJoin(prices, eq(subscriptionItems.priceId, prices.id))
    .where(
      and(
        whereClauseFromObject(subscriptions, whereConditions),
        or(
          isNull(subscriptionItems.expiredAt),
          gt(subscriptionItems.expiredAt, new Date())
        )
      )
    )

  const subscriptionItemsBySubscriptionId = result.reduce(
    (acc, row) => {
      const subscriptionId = row.subscription?.id
      if (!subscriptionId) {
        return acc
      }
      if (!acc.has(subscriptionId)) {
        acc.set(subscriptionId, {
          ...subscriptionsSelectSchema.parse(row.subscription),
          current: isSubscriptionCurrent(
            row.subscription?.status as SubscriptionStatus
          ),
          subscriptionItems: [],
        })
      }
      acc.get(subscriptionId)?.subscriptionItems.push({
        ...subscriptionItemsSelectSchema.parse(row.subscriptionItems),
        price: pricesClientSelectSchema.parse(row.price),
      })
      return acc
    },
    new Map()
  )
  /**
   * Typecheck before parsing so we can catch type errors before runtime ones
   */
  const richSubscriptions: RichSubscription[] = Array.from(
    subscriptionItemsBySubscriptionId.values()
  )

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
