import {
  confirmPaymentIntent,
  dateFromStripeTimestamp,
} from './stripe'
import {
  insertPayment,
  safelyUpdatePaymentForRefund,
  selectPayments,
  selectPaymentById,
} from '@/db/tableMethods/paymentMethods'
import { PaymentStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import {
  getPaymentIntent,
  getStripeCharge,
  listRefundsForCharge,
  refundPayment,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import Stripe from 'stripe'
import { Payment } from '@/db/schema/payments'
import { chargeStatusToPaymentStatus } from './bookkeeping/processPaymentIntentStatusUpdated'

export const refundPaymentTransaction = async (
  { id, partialAmount }: { id: string; partialAmount: number | null },
  transaction: DbTransaction
): Promise<Payment.Record> => {
  const payment = await selectPaymentById(id, transaction)

  if (!payment) {
    throw new Error('Payment not found')
  }

  if (payment.status === PaymentStatus.Refunded) {
    throw new Error('Payment has already been refunded')
  }

  if (payment.status === PaymentStatus.Processing) {
    throw new Error(
      'Cannot refund a payment that is still processing'
    )
  }
  if (partialAmount && partialAmount > payment.amount) {
    throw new Error(
      'Partial amount cannot be greater than the payment amount'
    )
  }
  let refund: Stripe.Refund | null = null
  try {
    refund = await refundPayment(
      payment.stripePaymentIntentId,
      partialAmount,
      payment.livemode
    )
  } catch (error) {
    const alreadyRefundedError =
      error instanceof Stripe.errors.StripeError &&
      (error.raw as { code: string }).code ===
        'charge_already_refunded'
    if (!alreadyRefundedError) {
      throw error
    }
    const paymentIntent = await getPaymentIntent(
      payment.stripePaymentIntentId
    )
    if (!paymentIntent.latest_charge) {
      throw new Error(
        `Payment ${payment.id} has no associated Stripe charge`
      )
    }

    const charge = await getStripeCharge(
      stripeIdFromObjectOrId(paymentIntent.latest_charge!)
    )
    if (!charge.refunded) {
      throw new Error(
        `Payment ${payment.id} has a charge ${charge.id} that has not been refunded`
      )
    }
    const refunds = await listRefundsForCharge(
      charge.id,
      payment.livemode
    )
    refund = refunds.data[0]
  }

  const updatedPayment = await safelyUpdatePaymentForRefund(
    {
      id: payment.id,
      status: PaymentStatus.Refunded,
      refunded: true,
      refundedAmount: payment.amount,
      refundedAt: dateFromStripeTimestamp(refund.created),
    },
    transaction
  )

  return updatedPayment
}

/**
 * Returns the payment status for a given Stripe payment intent
 * @param paymentIntent - The Stripe payment intent to get the status for
 * @returns The payment status for the given Stripe payment intent
 */
const paymentStatusFromStripePaymentIntent = async (
  paymentIntent: Stripe.PaymentIntent
): Promise<PaymentStatus> => {
  /**
   * TODO: verify that this is correct: that if there is no latest charge,
   * the payment status should be processing
   */
  if (!paymentIntent.latest_charge) {
    return PaymentStatus.Processing
  }
  const charge = await getStripeCharge(
    stripeIdFromObjectOrId(paymentIntent.latest_charge)
  )
  return chargeStatusToPaymentStatus(charge.status)
}

export const retryPaymentTransaction = async (
  { id }: { id: string },
  transaction: DbTransaction
) => {
  const payment = await selectPaymentById(id, transaction)
  if (!payment) {
    throw new Error('Payment not found')
  }
  if (payment.status !== PaymentStatus.Failed) {
    throw new Error('Payment is not failed')
  }
  if (payment.refunded) {
    throw new Error('Payment is refunded')
  }
  const paymentIntent = await getPaymentIntent(
    payment.stripePaymentIntentId
  )
  if (!paymentIntent.latest_charge) {
    throw new Error('Payment has no associated Stripe charge')
  }
  try {
    const paymentIntent = await confirmPaymentIntent(
      payment.stripePaymentIntentId,
      payment.livemode
    )

    const paymentInsert: Payment.Insert = {
      status:
        await paymentStatusFromStripePaymentIntent(paymentIntent),
      stripePaymentIntentId: payment.stripePaymentIntentId,
      livemode: payment.livemode,
      amount: payment.amount,
      currency: payment.currency,
      refunded: false,
      refundedAmount: 0,
      refundedAt: null,
      stripeChargeId: stripeIdFromObjectOrId(
        paymentIntent.latest_charge!
      ),
      organizationId: payment.organizationId,
      customerId: payment.customerId,
      invoiceId: payment.invoiceId,
      paymentMethod: payment.paymentMethod,
      chargeDate: payment.chargeDate,
      failureCode: payment.failureCode,
    }
    return await insertPayment(paymentInsert, transaction)
  } catch (error) {
    console.error('Error retrying charge:', error)
    throw error
  }
}

export const sumNetTotalSettledPaymentsForPaymentSet = (
  paymentSet: Pick<
    Payment.Record,
    'status' | 'amount' | 'refundedAmount'
  >[]
) => {
  const total = paymentSet.reduce((acc, payment) => {
    if (payment.status === PaymentStatus.Succeeded) {
      return acc + payment.amount
    }
    if (payment.status === PaymentStatus.Refunded) {
      return acc + (payment.amount - (payment.refundedAmount ?? 0))
    }
    return acc
  }, 0)
  return total
}

export const sumNetTotalSettledPaymentsForBillingPeriod = async (
  billingPeriodId: string,
  transaction: DbTransaction
) => {
  const payments = await selectPayments(
    { billingPeriodId },
    transaction
  )
  return {
    payments,
    total: sumNetTotalSettledPaymentsForPaymentSet(payments),
  }
}
