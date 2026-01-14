import { logger, task } from '@trigger.dev/sdk'
import type Stripe from 'stripe'
import { adminTransaction } from '@/db/adminTransaction'
import { createNoopContext } from '@/db/transactionEffectsHelpers'
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
          return adminTransaction(async ({ transaction }) => {
            return await processOutcomeForBillingRun(
              { input: payload },
              createNoopContext(transaction)
            )
          })
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
