import { logger, task } from '@trigger.dev/sdk'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { Subscription } from '@/db/schema/subscriptions'
import { safelyUpdateSubscriptionStatus } from '@/db/tableMethods/subscriptionMethods'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { SubscriptionStatus } from '@/types'
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
    const canceledSubscription = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        return cancelSubscriptionImmediately(
          {
            subscription,
          },
          transaction
        )
      },
      { operationName: 'cancelSubscriptionImmediately' }
    )

    await storeTelemetry('subscription', subscription.id, ctx.run.id)

    return {
      message: 'Subscription cancellation successful',
      canceledSubscription,
    }
  },
})
