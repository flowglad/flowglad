import { adminTransaction } from '@/db/adminTransaction'
import { BillingRun } from '@/db/schema/billingRuns'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { BillingRunStatus } from '@/types'
import { logger, task } from '@trigger.dev/sdk'
import { storeTelemetry } from '@/utils/redis'

export const attemptBillingRunTask = task({
  id: 'attempt-billing-run',
  run: async (
    payload: {
      billingRun: BillingRun.Record
    },
    { ctx }
  ) => {
    logger.log('Attempting billing run', { payload, ctx })
    if (payload.billingRun.status !== BillingRunStatus.Scheduled) {
      return logger.log('Billing run status is not scheduled', {
        payload,
        ctx,
      })
    }
    await executeBillingRun(payload.billingRun.id)
    const updatedBillingRun = await adminTransaction(
      ({ transaction }) => {
        return selectBillingRunById(
          payload.billingRun.id,
          transaction
        )
      }
    )


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
})
