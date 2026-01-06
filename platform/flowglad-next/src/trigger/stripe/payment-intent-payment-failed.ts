import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { tracedTaskRun } from '@/utils/triggerTracing'

export const stripePaymentIntentPaymentFailedTask = task({
  id: 'stripe-payment-intent-payment-failed',
  run: async (
    payload: Stripe.PaymentIntentPaymentFailedEvent,
    { ctx }
  ) => {
    return tracedTaskRun(
      'stripePaymentIntentFailed',
      async () => {
        const metadata = payload.data.object.metadata
        if ('billingRunId' in metadata) {
          return comprehensiveAdminTransaction(
            async ({ transaction }) => {
              return await processOutcomeForBillingRun(
                { input: payload },
                transaction
              )
            },
            { operationName: 'processBillingRunPaymentFailed' }
          )
        } else {
          logger.log(
            'Payment intent payment failed, no action taken (not a billing run)',
            { payload, ctx }
          )
        }
      },
      { 'trigger.payment_intent_id': payload.data.object.id }
    )
  },
})
