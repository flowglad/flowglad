import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import type { TransactionEffectsContext } from '@/db/types'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'

export const stripePaymentIntentCanceledTask = task({
  id: 'stripe-payment-intent-canceled',
  run: async (
    payload: Stripe.PaymentIntentCanceledEvent,
    { ctx }
  ) => {
    const metadata = payload.data.object.metadata
    if ('billingRunId' in metadata) {
      const result = await adminTransactionWithResult(
        async (params) => {
          const effectsCtx: TransactionEffectsContext = {
            transaction: params.transaction,
            cacheRecomputationContext:
              params.cacheRecomputationContext,
            invalidateCache: params.invalidateCache,
            emitEvent: params.emitEvent,
            enqueueLedgerCommand: params.enqueueLedgerCommand,
            enqueueTriggerTask: params.enqueueTriggerTask,
          }
          return await processOutcomeForBillingRun(
            { input: payload },
            effectsCtx
          )
        }
      )
      return result.unwrap()
    } else {
      logger.log(
        'Payment intent canceled, no action taken (not a billing run)',
        { payload, ctx }
      )
    }
  },
})
