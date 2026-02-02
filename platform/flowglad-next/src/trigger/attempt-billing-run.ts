import { BillingRunStatus } from '@db-core/enums'
import type { BillingRun } from '@db-core/schema/billingRuns'
import { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { storeTelemetry } from '@/utils/redis'
import { tracedTaskRun } from '@/utils/triggerTracing'

export const attemptBillingRunTask = task({
  id: 'attempt-billing-run',
  run: async (
    payload: {
      billingRun: BillingRun.Record
      adjustmentParams?: {
        newSubscriptionItems: (
          | SubscriptionItem.Insert
          | SubscriptionItem.Record
        )[]
        adjustmentDate: Date | number
      }
    },
    { ctx }
  ) => {
    return tracedTaskRun(
      'attemptBillingRun',
      async () => {
        logger.log('Attempting billing run', { payload, ctx })
        if (
          payload.billingRun.status !== BillingRunStatus.Scheduled
        ) {
          return logger.log('Billing run status is not scheduled', {
            payload,
            ctx,
          })
        }
        const billingRunResult = await executeBillingRun(
          payload.billingRun.id,
          payload.adjustmentParams
        )
        // Throw on error to trigger Trigger.dev retry
        if (Result.isError(billingRunResult)) {
          throw billingRunResult.error
        }
        const updatedBillingRun = (
          await adminTransaction(({ transaction }) => {
            return selectBillingRunById(
              payload.billingRun.id,
              transaction
            )
          })
        ).unwrap()

        await storeTelemetry(
          'billing_run',
          payload.billingRun.id,
          ctx.run.id
        )

        return {
          message: 'Billing run executed',
          updatedBillingRun,
        }
      },
      {
        'trigger.billing_run_id': payload.billingRun.id,
        'trigger.livemode': payload.billingRun.livemode,
      }
    )
  },
})
