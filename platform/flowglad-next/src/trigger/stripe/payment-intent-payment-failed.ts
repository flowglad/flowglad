import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { adminTransaction } from '@/db/adminTransaction'
import type { TransactionEffectsContext } from '@/db/types'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { tracedTaskRun } from '@/utils/triggerTracing'

export const stripePaymentIntentPaymentFailedTask = task({
  id: 'stripe-payment-intent-payment-failed',
  run: async (
    payload: Stripe.PaymentIntentPaymentFailedEvent,
    { ctx }
  ) => {
    return tracedTaskRun(
      'stripePaymentIntentFailed',
      async () => {
        const metadata = payload.data.object.metadata
        if ('billingRunId' in metadata) {
          const result = await adminTransaction(async (params) => {
            const effectsCtx: TransactionEffectsContext = {
              transaction: params.transaction,
              cacheRecomputationContext:
                params.cacheRecomputationContext,
              invalidateCache: params.invalidateCache,
              emitEvent: params.emitEvent,
              enqueueLedgerCommand: params.enqueueLedgerCommand,
            }
            return await processOutcomeForBillingRun(
              { input: payload },
              effectsCtx
            )
          })
          return result.unwrap()
        } else {
          logger.log(
            'Payment intent payment failed, no action taken (not a billing run)',
            { payload, ctx }
          )
        }
      },
      { 'trigger.payment_intent_id': payload.data.object.id }
    )
  },
})
