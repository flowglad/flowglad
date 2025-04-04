import { adminTransaction } from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { task } from '@trigger.dev/sdk/v3'
import Stripe from 'stripe'

export const stripePaymentIntentCanceledTask = task({
  id: 'stripe-payment-intent-canceled',
  run: async (
    payload: Stripe.PaymentIntentCanceledEvent,
    { ctx }
  ) => {
    await adminTransaction(async ({ transaction }) => {
      const metadata = payload.data.object.metadata
      if ('billingRunId' in metadata) {
        await processPaymentIntentEventForBillingRun(
          payload,
          transaction
        )
      }
    })
  },
})
