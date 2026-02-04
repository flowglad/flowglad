import { idempotencyKeys, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectSubscriptionsToBeCancelled } from '@/db/tableMethods/subscriptionMethods'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { attemptSubscriptionCancellationTask } from './attempt-subscription-cancellation'

export const attemptCancelScheduledSubscriptionsTask = task({
  id: 'attempt-cancel-scheduled-subscriptions',
  run: async (
    payload: {
      startDateISO: string
      endDateISO: string
    },
    { ctx }
  ) => {
    const {
      testmodeSubscriptionsToCancel,
      livemodeSubscriptionsToCancel,
    } = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok({
          testmodeSubscriptionsToCancel:
            await selectSubscriptionsToBeCancelled(
              {
                rangeStart: new Date(payload.startDateISO),
                rangeEnd: new Date(payload.endDateISO),
                livemode: false,
              },
              transaction
            ),
          livemodeSubscriptionsToCancel:
            await selectSubscriptionsToBeCancelled(
              {
                rangeStart: new Date(payload.startDateISO),
                rangeEnd: new Date(payload.endDateISO),
                livemode: true,
              },
              transaction
            ),
        })
      })
    ).unwrap()
    if (testmodeSubscriptionsToCancel.length > 0) {
      const testmodeSubscriptionCancellationIdempotencyKey =
        await createTriggerIdempotencyKey(
          'attempt-testmode-subscription-cancellation'
        )
      await attemptSubscriptionCancellationTask.batchTrigger(
        testmodeSubscriptionsToCancel.map((subscription) => ({
          payload: {
            subscription,
          },
        })),
        {
          idempotencyKey:
            testmodeSubscriptionCancellationIdempotencyKey,
        }
      )
    }
    if (livemodeSubscriptionsToCancel.length > 0) {
      const livemodeSubscriptionCancellationIdempotencyKey =
        await createTriggerIdempotencyKey(
          'attempt-livemode-subscription-cancellation'
        )
      await attemptSubscriptionCancellationTask.batchTrigger(
        livemodeSubscriptionsToCancel.map((subscription) => ({
          payload: {
            subscription,
          },
        })),
        {
          idempotencyKey:
            livemodeSubscriptionCancellationIdempotencyKey,
        }
      )
    }

    return {
      message: 'Attempted to cancel scheduled subscriptions',
    }
  },
})
