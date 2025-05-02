import { adminTransaction } from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { task } from '@trigger.dev/sdk'
import Stripe from 'stripe'

export const stripePaymentIntentPaymentFailedTask = task({
  id: 'stripe-payment-intent-payment-failed',
  run: async (
    payload: Stripe.PaymentIntentPaymentFailedEvent,
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
