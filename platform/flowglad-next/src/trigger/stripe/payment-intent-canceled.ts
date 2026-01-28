import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import { adminTransaction } from '@/db/adminTransaction'
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
      const txResult = await adminTransaction(async (params) => {
        const effectsCtx: TransactionEffectsContext = {
          transaction: params.transaction,
          cacheRecomputationContext: params.cacheRecomputationContext,
          invalidateCache: params.invalidateCache,
          emitEvent: params.emitEvent,
          enqueueLedgerCommand: params.enqueueLedgerCommand,
        }
        const innerResult = await processOutcomeForBillingRun(
          { input: payload },
          effectsCtx
        )
        return Result.ok(innerResult.unwrap())
      })
      return txResult.unwrap()
    } else {
      logger.log(
        'Payment intent canceled, no action taken (not a billing run)',
        { payload, ctx }
      )
    }
  },
})
