import { logger, task } from '@trigger.dev/sdk/v3'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { adminTransaction } from '@/db/adminTransaction'
import { attemptToTransitionSubscriptionBillingPeriod } from '@/subscriptions/billingPeriodHelpers'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'

export const attemptBillingPeriodTransitionTask = task({
  id: 'attempt-billing-period-transition',
  run: async (
    payload: { billingPeriod: BillingPeriod.Record },
    { ctx }
  ) => {
    const billingPeriod = payload.billingPeriod
    logger.log('Attempting to transition billing period', {
      billingPeriod,
      ctx,
    })

    const { billingRun } = await adminTransaction(
      async ({ transaction }) => {
        return attemptToTransitionSubscriptionBillingPeriod(
          billingPeriod,
          transaction
        )
      }
    )

    if (billingRun) {
      await executeBillingRun(billingRun.id)
    }

    return {
      message: 'Billing period transitioned',
    }
  },
})
