import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingRun } from '@/db/schema/billingRuns'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { BillingRunStatus } from '@/types'
import { storeTelemetry } from '@/utils/redis'

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
    logger.log('Attempting billing run', { payload, ctx })
    if (payload.billingRun.status !== BillingRunStatus.Scheduled) {
      return logger.log('Billing run status is not scheduled', {
        payload,
        ctx,
      })
    }
    await executeBillingRun(
      payload.billingRun.id,
      payload.adjustmentParams
    )
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
