import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
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
          return comprehensiveAdminTransaction(async (params) => {
            const effectsCtx: TransactionEffectsContext = {
              transaction: params.transaction,
              invalidateCache: params.invalidateCache,
              emitEvent: params.emitEvent,
              enqueueLedgerCommand: params.enqueueLedgerCommand,
            }
            const result = await processOutcomeForBillingRun(
              { input: payload },
              effectsCtx
            )
            return Result.ok(result)
          })
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
