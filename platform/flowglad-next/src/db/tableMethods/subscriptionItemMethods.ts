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
  Subscription,
  subscriptions,
  subscriptionsSelectSchema,
} from '../schema/subscriptions'
import { eq } from 'drizzle-orm'
import {
  RichSubscription,
  richSubscriptionClientSelectSchema,
  RichSubscriptionItem,
} from '@/subscriptions/schemas'
import { pricesClientSelectSchema } from '../schema/prices'
import { prices } from '../schema/prices'

const config: ORMMethodCreatorConfig<
  typeof subscriptionItems,
  typeof subscriptionItemsSelectSchema,
  typeof subscriptionItemsInsertSchema,
  typeof subscriptionItemsUpdateSchema
> = {
  selectSchema: subscriptionItemsSelectSchema,
  insertSchema: subscriptionItemsInsertSchema,
  updateSchema: subscriptionItemsUpdateSchema,
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

const bulkUpsertSubscriptionItems = createBulkUpsertFunction(
  subscriptionItems,
  config
)

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

export const selectSubscriptionItemsAndSubscriptionBysubscriptionId =
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
    | SubscriptionItem.Record
    | SubscriptionItem.Insert
  )[],
  transaction: DbTransaction
) => {
  return bulkUpsertSubscriptionItems(
    subscriptionItemUpdates,
    [subscriptionItems.id],
    transaction
  )
}

export const deleteSubscriptionItem = async (
  subscriptionItemId: string,
  transaction: DbTransaction
) => {
  await transaction
    .delete(subscriptionItems)
    .where(eq(subscriptionItems.id, subscriptionItemId))
}

export const selectRichSubscriptions = async (
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
    .innerJoin(
      subscriptions,
      eq(subscriptionItems.subscriptionId, subscriptions.id)
    )
    .innerJoin(prices, eq(subscriptionItems.priceId, prices.id))
    .where(whereClauseFromObject(subscriptions, whereConditions))

  const subscriptionItemsBysubscriptionId = result.reduce(
    (acc, row) => {
      const subscriptionId = row.subscription.id
      if (!acc.has(subscriptionId)) {
        acc.set(subscriptionId, {
          ...subscriptionsSelectSchema.parse(row.subscription),
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
    subscriptionItemsBysubscriptionId.values()
  )

  return richSubscriptions.map((item) =>
    richSubscriptionClientSelectSchema.parse(item)
  )
}
