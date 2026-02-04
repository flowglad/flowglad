import { idempotencyKeys, logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingRunsDueForExecution } from '@/db/tableMethods/billingRunMethods'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { attemptBillingRunTask } from './attempt-billing-run'

export const attemptBillingRunsTask = task({
  id: 'attempt-billing-runs',
  run: async (payload: { timestamp: Date }, { ctx }) => {
    const {
      livemodeBillingRunsToAttempt,
      testmodeBillingRunsToAttempt,
    } = (
      await adminTransaction(async ({ transaction }) => {
        const livemodeBillingRunsToAttempt =
          await selectBillingRunsDueForExecution(
            { livemode: true },
            transaction
          )
        const testmodeBillingRunsToAttempt =
          await selectBillingRunsDueForExecution(
            { livemode: false },
            transaction
          )
        return Result.ok({
          livemodeBillingRunsToAttempt,
          testmodeBillingRunsToAttempt,
        })
      })
    ).unwrap()
    if (livemodeBillingRunsToAttempt.length > 0) {
      /**
       * Ensure that billing runs are not attempted again if the cron job is retried
       */
      await attemptBillingRunTask.batchTrigger(
        livemodeBillingRunsToAttempt.map((billingRun) => ({
          payload: {
            billingRun,
            livemode: true,
          },
          idempotencyKey: createTriggerIdempotencyKey(
            `attempt-livemode-billing-run:${billingRun.id}`
          ),
        }))
      )
    }
    if (testmodeBillingRunsToAttempt.length > 0) {
      await attemptBillingRunTask.batchTrigger(
        testmodeBillingRunsToAttempt.map((billingRun) => ({
          payload: {
            billingRun,
            livemode: false,
          },
          idempotencyKey: createTriggerIdempotencyKey(
            `attempt-testmode-billing-run:${billingRun.id}`
          ),
        }))
      )
    }
    return {
      message: 'Hello, world!',
    }
  },
})
