import { logger, task } from '@trigger.dev/sdk'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { attemptToTransitionSubscriptionBillingPeriod } from '@/subscriptions/billingPeriodHelpers'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'

export const attemptBillingPeriodTransitionTask = task({
  id: 'attempt-billing-period-transition',
  run: async (
    payload: { billingPeriod: BillingPeriod.Record },
    { ctx }
  ) => {
    const { billingRun } = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        /**
         * Get the most up to date billing period from the database
         */
        const billingPeriod = await selectBillingPeriodById(
          payload.billingPeriod.id,
          transaction
        )
        logger.log('Attempting to transition billing period', {
          billingPeriod: payload.billingPeriod,
          ctx,
        })
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
