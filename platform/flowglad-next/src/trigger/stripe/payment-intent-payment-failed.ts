import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'

export const stripePaymentIntentPaymentFailedTask = task({
  id: 'stripe-payment-intent-payment-failed',
  run: async (
    payload: Stripe.PaymentIntentPaymentFailedEvent,
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
        'Payment intent payment failed, no action taken (not a billing run)',
        { payload, ctx }
      )
    }
  },
})
