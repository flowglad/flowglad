import {
  selectPayments,
  updatePayment,
} from '@/db/tableMethods/paymentMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'
import { PaymentStatus } from '@/types'

export const stripePaymentIntentProcessingTask = task({
  id: 'stripe-payment-intent-processing',
  run: async (
    payload: Stripe.PaymentIntentProcessingEvent,
    { ctx }
  ) => {
    logger.log('Payment intent processing', { payload, ctx })
    /**
     *
     */
    await adminTransaction(async ({ transaction }) => {
      const [payment] = await selectPayments(
        {
          stripePaymentIntentId: payload.data.object.id,
        },
        transaction
      )
      if (!payment) {
        logger.error('Payment not found', {
          paymentIntentId: payload.data.object.id,
        })
        return
      }
      await updatePayment(
        {
          id: payment.id,
          status: PaymentStatus.Processing,
        },
        transaction
      )
    })
    return {
      message: 'Hello, world!',
    }
  },
})
