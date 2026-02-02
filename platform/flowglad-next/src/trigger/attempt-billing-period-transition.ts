import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
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
        const result = await adminTransaction(
          async ({
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }) => {
            const ctx = {
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
              ctx,
            })
            return attemptToTransitionSubscriptionBillingPeriod(
              billingPeriod,
              ctx
            )
          }
        )
        const { billingRun } = result.unwrap()

        if (billingRun) {
          const billingRunResult = await executeBillingRun(
            billingRun.id
          )
          // Throw on error to trigger Trigger.dev retry
          if (Result.isError(billingRunResult)) {
            throw billingRunResult.error
          }
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
