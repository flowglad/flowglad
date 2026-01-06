import { schedules } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { deleteExpiredCheckoutSessionsAndFeeCalculations } from '@/db/tableMethods/checkoutSessionMethods'
import { attemptCancelScheduledSubscriptionsTask } from './attempt-cancel-scheduled-subscriptions'
import { attemptBillingRunsTask } from './attempt-run-all-billings'
import { attemptTransitionBillingPeriodsTask } from './attempt-transition-billing-periods'
import { failStalePaymentsTask } from './fail-stale-payments'

export const hourlyCron = schedules.task({
  id: 'hourly-cron',
  cron: '0 * * * *',
  run: async ({ lastTimestamp, timestamp }) => {
    return adminTransaction(
      async ({ transaction }) => {
        await deleteExpiredCheckoutSessionsAndFeeCalculations(
          transaction
        )
        await attemptBillingRunsTask.trigger(
          {
            timestamp,
          },
          {
            idempotencyKey: `attempt-billing-runs:${timestamp.toISOString()}`,
          }
        )
        const lastTimestampISO = (
          lastTimestamp ?? new Date(Date.now() - 1000 * 60 * 60)
        ).toISOString()
        await attemptCancelScheduledSubscriptionsTask.trigger(
          {
            startDateISO: lastTimestampISO,
            endDateISO: timestamp.toISOString(),
          },
          {
            idempotencyKey: `attempt-cancel-scheduled-subscriptions:${timestamp.toISOString()}`,
          }
        )

        await attemptTransitionBillingPeriodsTask.trigger(
          {
            lastTimestamp: new Date(lastTimestampISO),
            currentTimestamp: new Date(timestamp),
          },
          {
            idempotencyKey: `attempt-transition-billing-periods:${timestamp.toISOString()}`,
          }
        )

        await failStalePaymentsTask.trigger(
          {
            timestamp,
          },
          {
            idempotencyKey: `fail-stale-payments:${timestamp.toISOString()}`,
          }
        )
      },
      { operationName: 'hourlyCronCleanup' }
    )
  },
})
