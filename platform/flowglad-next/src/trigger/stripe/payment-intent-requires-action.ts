import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'

export const stripePaymentIntentRequiresActionTask = task({
  id: 'stripe-payment-intent-requires-action',
  run: async (
    payload: Stripe.PaymentIntentRequiresActionEvent,
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
        'Payment intent requires action, no action taken (not a billing run)',
        { payload, ctx }
      )
    }
  },
})
