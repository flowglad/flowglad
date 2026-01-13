import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'

export const stripePaymentIntentCanceledTask = task({
  id: 'stripe-payment-intent-canceled',
  run: async (
    payload: Stripe.PaymentIntentCanceledEvent,
    { ctx }
  ) => {
    const metadata = payload.data.object.metadata
    if ('billingRunId' in metadata) {
      return comprehensiveAdminTransaction(
        async ({ transaction, invalidateCache, emitEvent }) => {
          return await processOutcomeForBillingRun(
            { input: payload },
            transaction,
            invalidateCache!,
            emitEvent!
          )
        }
      )
    } else {
      logger.log(
        'Payment intent canceled, no action taken (not a billing run)',
        { payload, ctx }
      )
    }
  },
})
