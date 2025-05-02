import { BillingRun } from '@/db/schema/billingRuns'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { BillingRunStatus } from '@/types'
import { logger, task } from '@trigger.dev/sdk'

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
    return {
      message: 'Billing run executed',
    }
  },
})
