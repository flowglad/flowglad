import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'

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
          return await processOutcomeForBillingRun(
            { input: payload },
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
