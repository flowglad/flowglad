import type { Result } from 'better-result'
import Stripe from 'stripe'
import type { Payment } from '@/db/schema/payments'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  insertPayment,
  safelyUpdatePaymentForRefund,
  selectPaymentById,
  selectPayments,
} from '@/db/tableMethods/paymentMethods'
import type { DbTransaction } from '@/db/types'
import type { NotFoundError, ValidationError } from '@/errors'
import { PaymentStatus, StripeConnectContractType } from '@/types'
import { logger } from '@/utils/logger'
import {
  getPaymentIntent,
  getStripeCharge,
  listRefundsForCharge,
  refundPayment,
  reverseStripeTaxTransaction,
  stripeIdFromObjectOrId,
} from '@/utils/stripe'
import { chargeStatusToPaymentStatus } from './bookkeeping/processPaymentIntentStatusUpdated'
import {
  confirmPaymentIntent,
  dateFromStripeTimestamp,
} from './stripe'

export const refundPaymentTransaction = async (
  { id, partialAmount }: { id: string; partialAmount: number | null },
  transaction: DbTransaction
): Promise<
  Result<Payment.Record, NotFoundError | ValidationError>
> => {
  // =========================================================================
  // STEP 1: Validate the payment can be refunded
  // =========================================================================
  const payment = await selectPaymentById(id, transaction)

  if (!payment) {
    throw new Error('Payment not found')
  }

  // Additional refunds are only supported until the payment is fully refunded.
  if (payment.status === PaymentStatus.Refunded) {
    throw new Error('Payment has already been refunded')
  }

  if (payment.status === PaymentStatus.Processing) {
    throw new Error(
      'Cannot refund a payment that is still processing'
    )
  }
  if (partialAmount !== null) {
    if (partialAmount <= 0) {
      throw new Error('Partial amount must be greater than 0')
    }
    if (partialAmount > payment.amount) {
      throw new Error(
        'Partial amount cannot be greater than the payment amount'
      )
    }
  }

  // =========================================================================
  // STEP 2: Create refund in Stripe (or recover existing refund state)
  // =========================================================================
  let refundCreatedSeconds: number
  let nextRefundedAmount: number
  // Track if we created a new refund - used to determine if we should reverse tax
  let newlyCreatedRefund: Stripe.Refund | null = null

  try {
    // SUCCESS PATH: Create a new refund via Stripe API
    const refund = await refundPayment(
      payment.stripePaymentIntentId,
      partialAmount,
      payment.livemode
    )
    refundCreatedSeconds = refund.created
    nextRefundedAmount = (payment.refundedAmount ?? 0) + refund.amount
    // Mark that we created a new refund (triggers tax reversal later)
    newlyCreatedRefund = refund
  } catch (error) {
    // RECOVERY PATH: Handle case where charge was already refunded
    // This can happen if:
    //   - Refund was done manually in Stripe dashboard
    //   - Previous call succeeded in Stripe but failed before DB update
    //   - Network retry after Stripe already processed the refund
    const alreadyRefundedError =
      error instanceof Stripe.errors.StripeError &&
      (error.raw as { code: string }).code ===
        'charge_already_refunded'
    if (!alreadyRefundedError) {
      throw error
    }

    // Fetch the existing refund state from Stripe to sync our DB
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
    if (refunds.data.length === 0) {
      throw new Error(
        `Payment ${payment.id} has a charge ${charge.id} marked refunded, but no refunds were returned by Stripe`
      )
    }

    // Use the most recent refund timestamp
    refundCreatedSeconds = refunds.data.reduce(
      (latestCreated, refund) => {
        return Math.max(latestCreated, refund.created)
      },
      0
    )
    // Use Stripe's total refunded amount as source of truth
    const amountRefundedFromStripe =
      typeof charge.amount_refunded === 'number'
        ? charge.amount_refunded
        : refunds.data.reduce((sum, refund) => {
            return sum + refund.amount
          }, 0)
    nextRefundedAmount = amountRefundedFromStripe
    // Note: newlyCreatedRefund stays null - we didn't create a refund, just syncing state
  }

  // =========================================================================
  // STEP 3: Reverse tax transaction (MOR only, only when new refund created)
  // =========================================================================
  // Only reverse tax when we actually created a new refund in this call.
  // Skip tax reversal in the recovery path since we didn't initiate the refund.
  if (newlyCreatedRefund && payment.stripeTaxTransactionId) {
    const organization = await selectOrganizationById(
      payment.organizationId,
      transaction
    )

    if (
      organization.stripeConnectContractType ===
      StripeConnectContractType.MerchantOfRecord
    ) {
      const isFullRefund = nextRefundedAmount >= payment.amount
      try {
        await reverseStripeTaxTransaction({
          stripeTaxTransactionId: payment.stripeTaxTransactionId,
          // Use refund ID for deterministic idempotency (not Date.now())
          reference: `refund_${payment.id}_${newlyCreatedRefund.id}`,
          livemode: payment.livemode,
          mode: isFullRefund ? 'full' : 'partial',
          // Use actual refunded amount from Stripe (not the requested partialAmount)
          flatAmount: isFullRefund
            ? undefined
            : newlyCreatedRefund.amount,
        })
      } catch (error) {
        // Log but don't fail the refund - tax reversal is best-effort
        logger.error(
          error instanceof Error ? error : new Error(String(error)),
          {
            message: 'Failed to reverse tax transaction',
            paymentId: payment.id,
            organizationId: payment.organizationId,
            stripeTaxTransactionId: payment.stripeTaxTransactionId,
          }
        )
      }
    }
  }

  // =========================================================================
  // STEP 4: Update payment record in database
  // =========================================================================
  return safelyUpdatePaymentForRefund(
    {
      id: payment.id,
      status:
        nextRefundedAmount >= payment.amount
          ? PaymentStatus.Refunded
          : PaymentStatus.Succeeded,
      refunded: nextRefundedAmount >= payment.amount,
      refundedAmount: nextRefundedAmount,
      refundedAt: dateFromStripeTimestamp(
        refundCreatedSeconds
      ).getTime(),
    },
    transaction
  )
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
   * FIXME: verify that this is correct: that if there is no latest charge,
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
      subtotal: payment.subtotal,
      taxAmount: payment.taxAmount,
      stripeTaxCalculationId: payment.stripeTaxCalculationId,
      stripeTaxTransactionId: payment.stripeTaxTransactionId,
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
      // Subtract any partial refunds from succeeded payments
      return acc + (payment.amount - (payment.refundedAmount ?? 0))
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
