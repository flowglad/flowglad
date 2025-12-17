import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'

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
          return await processOutcomeForBillingRun(
            { input: payload },
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
