import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import type { TransactionEffectsContext } from '@/db/types'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'

export const stripePaymentIntentRequiresActionTask = task({
  id: 'stripe-payment-intent-requires-action',
  run: async (
    payload: Stripe.PaymentIntentRequiresActionEvent,
    { ctx }
  ) => {
    const metadata = payload.data.object.metadata
    if ('billingRunId' in metadata) {
      return comprehensiveAdminTransaction(async (params) => {
        const effectsCtx: TransactionEffectsContext = {
          transaction: params.transaction,
          cacheRecomputationContext: params.cacheRecomputationContext,
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
        'Payment intent requires action, no action taken (not a billing run)',
        { payload, ctx }
      )
    }
  },
})
