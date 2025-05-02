import { adminTransaction } from '@/db/adminTransaction'
import { Subscription } from '@/db/schema/subscriptions'
import { safelyUpdateSubscriptionStatus } from '@/db/tableMethods/subscriptionMethods'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { SubscriptionStatus } from '@/types'
import { logger, task } from '@trigger.dev/sdk'

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
    const canceledSubscription = await adminTransaction(
      async ({ transaction }) => {
        if (
          subscription.canceledAt &&
          subscription.status !== SubscriptionStatus.Canceled
        ) {
          return safelyUpdateSubscriptionStatus(
            subscription,
            SubscriptionStatus.Canceled,
            transaction
          )
        }
        return cancelSubscriptionImmediately(
          subscription,
          transaction
        )
      }
    )
    return {
      message: 'Subscription cancellation successful',
      canceledSubscription,
    }
  },
})
