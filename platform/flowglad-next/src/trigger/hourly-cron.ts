import { adminTransaction } from '@/db/databaseMethods'
import { deleteExpiredCheckoutSessionsAndFeeCalculations } from '@/db/tableMethods/checkoutSessionMethods'
import { schedules } from '@trigger.dev/sdk/v3'
import { attemptBillingRunsTask } from './attempt-run-all-billings'
import { attemptCancelScheduledSubscriptionsTask } from './attempt-cancel-scheduled-subscriptions'

export const hourlyCron = schedules.task({
  id: 'hourly-cron',
  cron: '0 * * * *',
  run: async ({ lastTimestamp, timestamp }) => {
    return adminTransaction(async ({ transaction }) => {
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
      await attemptCancelScheduledSubscriptionsTask.trigger(
        {
          startDateISO: (
            lastTimestamp ?? new Date(Date.now() - 1000 * 60 * 60)
          ).toISOString(),
          endDateISO: timestamp.toISOString(),
        },
        {
          idempotencyKey: `attempt-cancel-scheduled-subscriptions:${timestamp.toISOString()}`,
        }
      )
    })
  },
})
