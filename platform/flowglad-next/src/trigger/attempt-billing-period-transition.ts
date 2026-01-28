import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { attemptToTransitionSubscriptionBillingPeriod } from '@/subscriptions/billingPeriodHelpers'
import { executeBillingRun } from '@/subscriptions/billingRunHelpers'
import { storeTelemetry } from '@/utils/redis'
import { tracedTaskRun } from '@/utils/triggerTracing'

export const attemptBillingPeriodTransitionTask = task({
  id: 'attempt-billing-period-transition',
  run: async (
    payload: { billingPeriod: BillingPeriod.Record },
    { ctx }
  ) => {
    return tracedTaskRun(
      'attemptBillingPeriodTransition',
      async () => {
        const txResult = await adminTransaction(
          async ({
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }) => {
            const effectsCtx = {
              transaction,
              cacheRecomputationContext,
              invalidateCache,
              emitEvent,
              enqueueLedgerCommand,
            }
            const billingPeriod = (
              await selectBillingPeriodById(
                payload.billingPeriod.id,
                transaction
              )
            ).unwrap()
            logger.log('Attempting to transition billing period', {
              billingPeriod: payload.billingPeriod,
              effectsCtx,
            })
            return attemptToTransitionSubscriptionBillingPeriod(
              billingPeriod,
              effectsCtx
            )
          }
        )
        const { billingRun } = txResult.unwrap()

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
      {
        'trigger.billing_period_id': payload.billingPeriod.id,
        'trigger.livemode': payload.billingPeriod.livemode,
      }
    )
  },
})
