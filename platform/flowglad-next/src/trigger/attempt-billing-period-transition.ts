import { logger, task } from '@trigger.dev/sdk'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { attemptToTransitionSubscriptionBillingPeriod } from '@/subscriptions/billingPeriodHelpers'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { storeTelemetry } from '@/utils/redis'

export const attemptBillingPeriodTransitionTask = task({
  id: 'attempt-billing-period-transition',
  run: async (
    payload: { billingPeriod: BillingPeriod.Record },
    { ctx }
  ) => {
    const { billingRun } = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
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

    await storeTelemetry(
      'subscription',
      payload.billingPeriod.subscriptionId,
      ctx.run.id
    )

    return {
      message: 'Billing period transitioned',
    }
  },
})
