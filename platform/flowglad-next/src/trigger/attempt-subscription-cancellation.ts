import { SubscriptionStatus } from '@db-core/enums'
import type { Subscription } from '@db-core/schema/subscriptions'
import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { storeTelemetry } from '@/utils/redis'

export const attemptSubscriptionCancellationTask = task({
  id: 'attempt-subscription-cancellation',
  run: async (
    {
      subscription,
    }: {
      subscription: Subscription.Record
    },
    { ctx }
  ) => {
    logger.log('Attempting subscription cancellation', {
      subscription,
      ctx,
    })
    if (
      subscription.canceledAt &&
      subscription.status === SubscriptionStatus.Canceled
    ) {
      return {
        message: 'Subscription already ended',
      }
    }
    const result = await adminTransaction(async (ctx) => {
      return cancelSubscriptionImmediately({ subscription }, ctx)
    })
    const canceledSubscription = result.unwrap()

    await storeTelemetry('subscription', subscription.id, ctx.run.id)

    return {
      message: 'Subscription cancellation successful',
      canceledSubscription,
    }
  },
})
