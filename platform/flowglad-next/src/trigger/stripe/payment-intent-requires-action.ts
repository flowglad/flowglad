import { adminTransaction } from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { task } from '@trigger.dev/sdk/v3'
import Stripe from 'stripe'

export const stripePaymentIntentRequiresActionTask = task({
  id: 'stripe-payment-intent-requires-action',
  run: async (
    payload: Stripe.PaymentIntentRequiresActionEvent,
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
