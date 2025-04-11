import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  Subscription,
  subscriptions,
  subscriptionsInsertSchema,
  subscriptionsSelectSchema,
  subscriptionsTableRowDataSchema,
  subscriptionsUpdateSchema,
} from '@/db/schema/subscriptions'
import {
  and,
  lte,
  gte,
  eq,
  desc,
  gt,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { SubscriptionStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { customers } from '../schema/customers'
import { prices } from '../schema/prices'
import { products } from '../schema/products'

const config: ORMMethodCreatorConfig<
  typeof subscriptions,
  typeof subscriptionsSelectSchema,
  typeof subscriptionsInsertSchema,
  typeof subscriptionsUpdateSchema
> = {
  selectSchema: subscriptionsSelectSchema,
  insertSchema: subscriptionsInsertSchema,
  updateSchema: subscriptionsUpdateSchema,
}

export const selectSubscriptionById = createSelectById(
  subscriptions,
  config
)

export const insertSubscription = createInsertFunction(
  subscriptions,
  config
)

export const updateSubscription = createUpdateFunction(
  subscriptions,
  config
)

export const selectSubscriptions = createSelectFunction(
  subscriptions,
  config
)

export const isSubscriptionInTerminalState = (
  status: SubscriptionStatus
) => {
  return [
    SubscriptionStatus.Canceled,
    SubscriptionStatus.IncompleteExpired,
  ].includes(status)
}

export const safelyUpdateSubscriptionStatus = async (
  subscription: Subscription.Record,
  status: SubscriptionStatus,
  transaction: DbTransaction
) => {
  if (subscription.status === status) {
    return subscription
  }
  if (isSubscriptionInTerminalState(subscription.status)) {
    throw new Error(
      `Subscription ${subscription.id} is in terminal state ${subscription.status} and cannot be updated to ${status}`
    )
  }
  return updateSubscription(
    { id: subscription.id, status },
    transaction
  )
}

export const selectSubscriptionsToBeCancelled = async (
  {
    rangeStart,
    rangeEnd,
    livemode,
  }: {
    rangeStart: Date
    rangeEnd: Date
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const subscriptionToCancel = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        gte(subscriptions.cancelScheduledAt, rangeStart),
        lte(subscriptions.cancelScheduledAt, rangeEnd),
        eq(subscriptions.livemode, livemode)
      )
    )
  return subscriptionToCancel.map((subscription) =>
    subscriptionsSelectSchema.parse(subscription)
  )
}

export const selectSubscriptionsTableRowData = async (
  organizationId: string,
  transaction: DbTransaction
) => {
  const subscriptionsRowData = await transaction
    .select({
      subscription: subscriptions,
      customer: customers,
      price: prices,
      product: products,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .innerJoin(prices, eq(subscriptions.priceId, prices.id))
    .innerJoin(products, eq(prices.productId, products.id))
    .where(eq(subscriptions.organizationId, organizationId))
    .orderBy(desc(subscriptions.createdAt))

  return subscriptionsRowData.map((row) =>
    subscriptionsTableRowDataSchema.parse({
      ...row,
      subscription: {
        ...row.subscription,
        current: isSubscriptionCurrent(
          row.subscription.status as SubscriptionStatus
        ),
      },
    })
  )
}

export const selectSubscriptionsPaginated =
  createPaginatedSelectFunction(subscriptions, config)

export const currentSubscriptionStatuses = [
  SubscriptionStatus.Active,
  SubscriptionStatus.PastDue,
  SubscriptionStatus.Trialing,
  SubscriptionStatus.CancellationScheduled,
  SubscriptionStatus.Unpaid,
]

export const isSubscriptionCurrent = (status: SubscriptionStatus) => {
  return currentSubscriptionStatuses.includes(status)
}

export const subscriptionWithCurrent = <
  T extends Subscription.ClientRecord,
>(
  subscription: T
): T & { current: boolean } => {
  return {
    ...subscription,
    current: isSubscriptionCurrent(subscription.status),
  }
}

const bulkInsertOrDoNothingSubscriptions =
  createBulkInsertOrDoNothingFunction(subscriptions, config)

export const bulkInsertOrDoNothingSubscriptionsByExternalId = (
  subscriptionInserts: Subscription.Insert[],
  transaction: DbTransaction
) => {
  return transaction
    .insert(subscriptions)
    .values(subscriptionInserts)
    .onConflictDoUpdate({
      target: [
        subscriptions.externalId,
        subscriptions.organizationId,
      ],
      set: {
        priceId: sql`excluded.price_id`,
      },
    })
  // return bulkInsertOrDoNothingSubscriptions(
  //   subscriptionInserts,
  //   [subscriptions.externalId, subscriptions.organizationId],
  //   transaction
  // )
}

export const getActiveSubscriptionsForPeriod = async (
  organizationId: string,
  startDate: Date,
  endDate: Date,
  transaction: DbTransaction
): Promise<Subscription.Record[]> => {
  const subscriptionRecords = await transaction
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        gte(subscriptions.startDate, startDate),
        or(
          isNull(subscriptions.canceledAt),
          gt(subscriptions.canceledAt, endDate)
        )
      )
    )

  return subscriptionRecords.map((subscription) =>
    subscriptionsSelectSchema.parse(subscription)
  )
}
