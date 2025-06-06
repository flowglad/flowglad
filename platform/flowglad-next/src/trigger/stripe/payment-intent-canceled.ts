import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'

export const stripePaymentIntentCanceledTask = task({
  id: 'stripe-payment-intent-canceled',
  run: async (
    payload: Stripe.PaymentIntentCanceledEvent,
    { ctx }
  ) => {
    const metadata = payload.data.object.metadata
    if ('billingRunId' in metadata) {
      return comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentEventForBillingRun(
            payload,
            transaction
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
