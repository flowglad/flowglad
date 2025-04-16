import { adminTransaction } from '@/db/adminTransaction'
import {
  selectPayments,
  safelyUpdatePaymentStatus,
  updatePayment,
} from '@/db/tableMethods/paymentMethods'
import { PaymentStatus } from '@/types'
import { getStripeCharge } from '@/utils/stripe'
import { logger, task } from '@trigger.dev/sdk/v3'
import Stripe from 'stripe'
import { sendCustomerPaymentFailedNotificationIdempotently } from '../notifications/send-customer-payment-failed-notification'

export const stripeChargeFailedTask = task({
  id: 'stripe-charge-failed',
  run: async (payload: Stripe.ChargeFailedEvent, { ctx }) => {
    const paymentRecord = await adminTransaction(
      async ({ transaction }) => {
        const stripeCharge = await getStripeCharge(
          payload.data.object.id
        )
        const [paymentRecord] = await selectPayments(
          { stripeChargeId: stripeCharge.id },
          transaction
        )
        if (!paymentRecord) {
          return null
        }
        await safelyUpdatePaymentStatus(
          paymentRecord,
          PaymentStatus.Failed,
          transaction
        )
        const updatedPaymentRecord = await updatePayment(
          {
            id: paymentRecord.id,
            failureCode: stripeCharge.failure_code,
            failureMessage: stripeCharge.failure_message,
          },
          transaction
        )
        return updatedPaymentRecord
      }
    )
    if (paymentRecord) {
      await sendCustomerPaymentFailedNotificationIdempotently(
        paymentRecord
      )
    } else {
      logger.error('Payment record not found for Stripe charge:', {
        stripeChargeId: payload.data.object.id,
        charge: payload.data.object,
      })
    }
  },
})
