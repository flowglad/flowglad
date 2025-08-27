import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  createCursorPaginatedSelectFunction,
  createBulkInsertOrDoNothingFunction,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  nonRenewingStatusSchema,
  standardSubscriptionSelectSchema,
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
  count,
  inArray,
} from 'drizzle-orm'
import { SubscriptionStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { customers, customersSelectSchema } from '../schema/customers'
import { prices, pricesSelectSchema } from '../schema/prices'
import { products, productsSelectSchema } from '../schema/products'
import { z } from 'zod'
import { PaymentMethod } from '../schema/paymentMethods'

const config: ORMMethodCreatorConfig<
  typeof subscriptions,
  typeof subscriptionsSelectSchema,
  typeof subscriptionsInsertSchema,
  typeof subscriptionsUpdateSchema
> = {
  selectSchema: subscriptionsSelectSchema,
  insertSchema: subscriptionsInsertSchema,
  updateSchema: subscriptionsUpdateSchema,
  tableName: 'subscriptions',
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
): Promise<Subscription.Record> => {
  if (status === SubscriptionStatus.CreditTrial) {
    throw new Error(
      `Cannot update subscription ${subscription.id} to credit trial status`
    )
  }
  if (subscription.status === status) {
    return subscription
  }
  if (isSubscriptionInTerminalState(subscription.status)) {
    throw new Error(
      `Subscription ${subscription.id} is in terminal state ${subscription.status} and cannot be updated to ${status}`
    )
  }
  if (!subscription.renews) {
    const safeStatus = nonRenewingStatusSchema.safeParse(status)
    if (!safeStatus.success) {
      throw new Error(
        `Subscription ${subscription.id} is a non-renewing subscription and cannot be updated to ${status}`
      )
    }
    const updatedSubscription = await updateSubscription(
      {
        id: subscription.id,
        status: safeStatus.data,
        renews: subscription.renews,
      },
      transaction
    )
    return updatedSubscription
  }

  const updatedSubscription = await updateSubscription(
    { id: subscription.id, status, renews: subscription.renews },
    transaction
  )
  if (updatedSubscription.status === SubscriptionStatus.CreditTrial) {
    throw new Error(
      `Subscription ${subscription.id} was updated to credit trial status. Credit_trial status is a status that can only be created, not updated to.`
    )
  }
  return standardSubscriptionSelectSchema.parse(updatedSubscription)
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

export const selectSubscriptionsTableRowData =
  createCursorPaginatedSelectFunction(
    subscriptions,
    config,
    subscriptionsTableRowDataSchema,
    async (
      subscriptions: Subscription.Record[],
      transaction: DbTransaction
    ) => {
      const priceIds = subscriptions
        .map((subscription) => subscription.priceId)
        .filter((id): id is string => id !== null)
      const customerIds = subscriptions
        .map((subscription) => subscription.customerId)
        .filter((id): id is string => id !== null)

      // Query 1: Get prices with products
      const priceResults = await transaction
        .select({
          price: prices,
          product: products,
        })
        .from(prices)
        .innerJoin(products, eq(products.id, prices.productId))
        .where(inArray(prices.id, priceIds))

      // Query 2: Get customers
      const customerResults = await transaction
        .select()
        .from(customers)
        .where(inArray(customers.id, customerIds))

      const pricesById = new Map(
        priceResults.map((result) => [result.price.id, result.price])
      )
      const productsById = new Map(
        priceResults.map((result) => [
          result.product.id,
          result.product,
        ])
      )
      const customersById = new Map(
        customerResults.map((customer) => [customer.id, customer])
      )

      return subscriptions.map((subscription) => {
        if (!subscription.priceId || !subscription.customerId) {
          throw new Error(
            `Subscription ${subscription.id} is missing required price or customer ID`
          )
        }

        const price = pricesById.get(subscription.priceId)
        const customer = customersById.get(subscription.customerId)

        if (!price || !customer) {
          throw new Error(
            `Could not find price or customer for subscription ${subscription.id}`
          )
        }

        const product = productsById.get(price.productId)
        if (!product) {
          throw new Error(
            `Could not find product for price ${price.id}`
          )
        }

        return {
          subscription: {
            ...subscription,
            current: isSubscriptionCurrent(
              subscription.status as SubscriptionStatus
            ),
          },
          price: pricesSelectSchema.parse(price),
          product: productsSelectSchema.parse(product),
          customer: customersSelectSchema.parse(customer),
        }
      })
    }
  )

export const selectSubscriptionsPaginated =
  createPaginatedSelectFunction(subscriptions, config)

export const currentSubscriptionStatuses = [
  SubscriptionStatus.Active,
  SubscriptionStatus.PastDue,
  SubscriptionStatus.Trialing,
  SubscriptionStatus.CancellationScheduled,
  SubscriptionStatus.Unpaid,
  SubscriptionStatus.CreditTrial,
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

export const selectSubscriptionCountsByStatus = async (
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      status: subscriptions.status,
      count: count(),
    })
    .from(subscriptions)
    .groupBy(subscriptions.status)

  return result.map((item) => ({
    status: item.status as SubscriptionStatus,
    count: item.count,
  }))
}

export const safelyUpdateSubscriptionsForCustomerToNewPaymentMethod =
  async (
    paymentMethod: PaymentMethod.Record,
    transaction: DbTransaction
  ) => {
    const subscriptionRecords = await selectSubscriptions(
      {
        customerId: paymentMethod.customerId,
        livemode: paymentMethod.livemode,
        status: currentSubscriptionStatuses,
      },
      transaction
    )
    const updatedSubscriptions = await transaction
      .update(subscriptions)
      .set({
        defaultPaymentMethodId: paymentMethod.id,
      })
      .where(
        inArray(
          subscriptions.id,
          subscriptionRecords.map((subscription) => subscription.id)
        )
      )
      .returning()
    return updatedSubscriptions
  }
