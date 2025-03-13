import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  Subscription,
  subscriptions,
  subscriptionsInsertSchema,
  subscriptionsSelectSchema,
  subscriptionsTableRowDataSchema,
  subscriptionsUpdateSchema,
} from '@/db/schema/subscriptions'
import { and, lte, gte, eq, desc } from 'drizzle-orm'
import { SubscriptionStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { customerProfiles } from '../schema/customerProfiles'
import { variants } from '../schema/variants'
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
      customerProfile: customerProfiles,
      variant: variants,
      product: products,
    })
    .from(subscriptions)
    .innerJoin(
      customerProfiles,
      eq(subscriptions.customerProfileId, customerProfiles.id)
    )
    .innerJoin(variants, eq(subscriptions.variantId, variants.id))
    .innerJoin(products, eq(variants.productId, products.id))
    .where(eq(subscriptions.organizationId, organizationId))
    .orderBy(desc(subscriptions.createdAt))

  return subscriptionsRowData.map((row) =>
    subscriptionsTableRowDataSchema.parse(row)
  )
}

export const selectSubscriptionsPaginated =
  createPaginatedSelectFunction(subscriptions, config)
