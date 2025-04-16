import {
  CurrencyCode,
  PaymentStatus,
  CheckoutSessionType,
} from '@/types'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { CountryCode } from '@/types'
import { DbTransaction } from '@/db/types'
import {
  stripeIdFromObjectOrId,
  paymentMethodFromStripeCharge,
  StripeIntentMetadata,
  getStripeCharge,
  stripeIntentMetadataSchema,
} from '../stripe'
import {
  safelyUpdatePaymentStatus,
  updatePayment,
  upsertPaymentByStripeChargeId,
} from '@/db/tableMethods/paymentMethods'
import Stripe from 'stripe'
import { Purchase } from '@/db/schema/purchases'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { isNil } from '@/utils/core'
import { processStripeChargeForCheckoutSession } from './checkoutSessions'
import { dateFromStripeTimestamp } from '@/utils/stripe'
import { Payment } from '@/db/schema/payments'
import { updateInvoiceStatusToReflectLatestPayment } from '../bookkeeping'
import { updatePurchaseStatusToReflectLatestPayment } from '../bookkeeping'
import {
  commitPaymentCanceledEvent,
  commitPaymentSucceededEvent,
} from '../events'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { selectInvoices } from '@/db/tableMethods/invoiceMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { sendCustomerPaymentFailedNotificationIdempotently } from '@/trigger/notifications/send-customer-payment-failed-notification'

export const chargeStatusToPaymentStatus = (
  chargeStatus: Stripe.Charge.Status
): PaymentStatus => {
  let paymentStatus: PaymentStatus = PaymentStatus.Processing
  if (chargeStatus === 'succeeded') {
    paymentStatus = PaymentStatus.Succeeded
  } else if (chargeStatus === 'failed') {
    paymentStatus = PaymentStatus.Failed
  }
  return paymentStatus
}

export const upsertPaymentForStripeCharge = async (
  {
    charge,
    paymentIntentMetadata,
  }: {
    charge: Stripe.Charge
    paymentIntentMetadata: StripeIntentMetadata
  },
  transaction: DbTransaction
) => {
  const paymentIntentId = charge.payment_intent
    ? stripeIdFromObjectOrId(charge.payment_intent)
    : null
  if (!paymentIntentId) {
    throw new Error(
      `No payment intent id found on charge ${charge.id}`
    )
  }
  if (!paymentIntentMetadata) {
    throw new Error(
      `No metadata found on payment intent ${paymentIntentId}`
    )
  }
  let organizationId: string | null = null
  let invoiceId: string | null = null
  let purchaseId: string | null = null
  let purchase: Purchase.Record | null = null
  let taxCountry: CountryCode | null = null
  let livemode: boolean | null = null
  let customerId: string | null = null
  let currency: CurrencyCode | null = null
  let subscriptionId: string | null = null
  if ('billingRunId' in paymentIntentMetadata) {
    const billingRun = await selectBillingRunById(
      paymentIntentMetadata.billingRunId,
      transaction
    )
    const subscription = await selectSubscriptionById(
      billingRun.subscriptionId,
      transaction
    )
    const [invoice] = await selectInvoices(
      {
        billingPeriodId: billingRun.billingPeriodId,
      },
      transaction
    )
    livemode = billingRun.livemode
    if (!invoice) {
      throw new Error(
        `No invoice found for billing run ${billingRun.id}`
      )
    }
    invoiceId = invoice.id
    currency = invoice.currency
    customerId = subscription.customerId
    organizationId = subscription.organizationId
    livemode = subscription.livemode
    subscriptionId = subscription.id
  } else if ('invoiceId' in paymentIntentMetadata) {
    // TODO: the whole "invoiceId" block should be removed
    // we now support paying invoices through purchase sessions,
    // which seems to be more adaptive,
    // and allows us to use the CheckoutPageContext and PaymentForm
    let [maybeInvoiceAndLineItems] =
      await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
        {
          id: paymentIntentMetadata.invoiceId,
        },
        transaction
      )
    const { invoice } = maybeInvoiceAndLineItems
    currency = invoice.currency
    invoiceId = invoice.id
    organizationId = invoice.organizationId!
    purchaseId = invoice.purchaseId
    taxCountry = invoice.taxCountry
    customerId = invoice.customerId
    livemode = invoice.livemode
    subscriptionId = invoice.subscriptionId
  } else if ('checkoutSessionId' in paymentIntentMetadata) {
    const {
      checkoutSession,
      purchase: updatedPurchase,
      invoice,
    } = await processStripeChargeForCheckoutSession(
      {
        checkoutSessionId: paymentIntentMetadata.checkoutSessionId,
        charge,
      },
      transaction
    )
    if (checkoutSession.type === CheckoutSessionType.Invoice) {
      throw new Error(
        `Cannot process paymentIntent with metadata.checkoutSessionId ${
          paymentIntentMetadata.checkoutSessionId
        } when checkoutSession type is ${
          CheckoutSessionType.Invoice
        }. Payment intent metadata should be an invoiceId in this case.`
      )
    }
    invoiceId = invoice?.id ?? null
    currency = invoice?.currency ?? null
    organizationId = invoice?.organizationId!
    taxCountry = invoice?.taxCountry ?? null
    purchase = updatedPurchase
    purchaseId = purchase?.id ?? null
    livemode = checkoutSession.livemode
    customerId = purchase?.customerId || invoice?.customerId || null
    // hard assumption
    // checkoutSessionId payment intents are only for anonymous single payment purchases
    subscriptionId = null
  } else {
    throw new Error(
      'No invoice, purchase, or subscription found for payment intent'
    )
  }

  if (!organizationId) {
    throw new Error(
      `No organization found for payment intent ${paymentIntentId}`
    )
  }
  if (!invoiceId) {
    throw new Error(
      `No invoice found for payment intent ${paymentIntentId}`
    )
  }
  if (!customerId) {
    throw new Error(
      `No customer id found for payment intent ${paymentIntentId} with metadata: ${JSON.stringify(
        paymentIntentMetadata
      )}`
    )
  }
  if (isNil(livemode)) {
    throw new Error(
      `No livemode set for payment intent ${paymentIntentId}, with metadata: ${JSON.stringify(
        paymentIntentMetadata
      )}`
    )
  }

  const latestChargeDate = charge.created

  if (!latestChargeDate) {
    throw new Error(
      `No charge date found for payment intent ${paymentIntentId}`
    )
  }

  if (!taxCountry) {
    taxCountry = charge.billing_details?.address
      ?.country as CountryCode
  }

  const paymentInsert: Payment.Insert = {
    amount: charge.amount,
    status: chargeStatusToPaymentStatus(charge.status),
    invoiceId,
    chargeDate: dateFromStripeTimestamp(latestChargeDate),
    refunded: false,
    organizationId,
    purchaseId,
    stripePaymentIntentId: paymentIntentId,
    paymentMethod: paymentMethodFromStripeCharge(charge),
    currency: currency ?? CurrencyCode.USD,
    refundedAt: null,
    taxCountry,
    stripeChargeId: stripeIdFromObjectOrId(charge),
    customerId,
    livemode,
  }
  const payment = await upsertPaymentByStripeChargeId(
    paymentInsert,
    transaction
  )
  const latestPayment =
    await updatePaymentToReflectLatestChargeStatus(
      payment,
      charge,
      transaction
    )
  return latestPayment
}

/**
 * An idempotent method to mark a payment as succeeded.
 * @param paymentId
 * @param transaction
 * @returns
 */
export const updatePaymentToReflectLatestChargeStatus = async (
  payment: Payment.Record,
  charge: Stripe.Charge,
  transaction: DbTransaction
) => {
  const newPaymentStatus = chargeStatusToPaymentStatus(charge.status)
  let updatedPayment: Payment.Record = payment
  if (payment.status !== newPaymentStatus) {
    updatedPayment = await safelyUpdatePaymentStatus(
      payment,
      newPaymentStatus,
      transaction
    )
    if (newPaymentStatus === PaymentStatus.Failed) {
      await updatePayment(
        {
          id: payment.id,
          failureCode: charge.failure_code,
          failureMessage: charge.failure_message,
        },
        transaction
      )
      await sendCustomerPaymentFailedNotificationIdempotently(
        updatedPayment
      )
    }
  }
  /**
   * Update associated invoice if it exists
   */
  if (payment.invoiceId) {
    await updateInvoiceStatusToReflectLatestPayment(
      updatedPayment,
      transaction
    )
  }
  if (payment.purchaseId) {
    /**
     * Update associated purchase if it exists
     */
    await updatePurchaseStatusToReflectLatestPayment(
      updatedPayment,
      transaction
    )
  }
  if (!payment.invoiceId && !payment.purchaseId) {
    throw new Error(
      `No invoice or purchase found for payment ${payment.id}`
    )
  }
  return updatedPayment
}

/**
 * If the payment has already been marked succeeded, return.
 * Otherwise, we need to create a payment record and mark it succeeded.
 * @param paymentIntent
 * @param transaction
 * @returns
 */
export const processPaymentIntentStatusUpdated = async (
  paymentIntent: Stripe.PaymentIntent,
  transaction: DbTransaction
) => {
  const metadata = paymentIntent.metadata
  if (!metadata) {
    throw new Error(
      `No metadata found for payment intent ${paymentIntent.id}`
    )
  }
  if (!paymentIntent.latest_charge) {
    throw new Error(
      `No latest charge found for payment intent ${paymentIntent.id}`
    )
  }
  const latestChargeId = stripeIdFromObjectOrId(
    paymentIntent.latest_charge!
  )
  const latestCharge = await getStripeCharge(latestChargeId)
  if (!latestCharge) {
    throw new Error(
      `No charge found for payment intent ${paymentIntent.id}`
    )
  }
  const payment = await upsertPaymentForStripeCharge(
    {
      charge: latestCharge,
      paymentIntentMetadata: stripeIntentMetadataSchema.parse(
        paymentIntent.metadata
      ),
    },
    transaction
  )
  if (paymentIntent.status === 'succeeded') {
    await commitPaymentSucceededEvent(payment, transaction)
  } else if (paymentIntent.status === 'canceled') {
    await commitPaymentCanceledEvent(payment, transaction)
  }
  return { payment }
}
