import {
  CurrencyCode,
  PaymentStatus,
  PurchaseSessionType,
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
  upsertPaymentByStripeChargeId,
} from '@/db/tableMethods/paymentMethods'
import Stripe from 'stripe'
import { Purchase } from '@/db/schema/purchases'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { isNil } from '@/utils/core'
import { processStripeChargeForPurchaseSession } from './purchaseSessions'
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
  let OrganizationId: string | null = null
  let InvoiceId: string | null = null
  let PurchaseId: string | null = null
  let purchase: Purchase.Record | null = null
  let taxCountry: CountryCode | null = null
  let livemode: boolean | null = null
  let CustomerProfileId: string | null = null
  let currency: CurrencyCode | null = null
  if ('billingRunId' in paymentIntentMetadata) {
    const billingRun = await selectBillingRunById(
      paymentIntentMetadata.billingRunId,
      transaction
    )
    const subscription = await selectSubscriptionById(
      billingRun.SubscriptionId,
      transaction
    )
    const [invoice] = await selectInvoices(
      {
        BillingPeriodId: billingRun.BillingPeriodId,
      },
      transaction
    )
    livemode = billingRun.livemode
    if (!invoice) {
      throw new Error(
        `No invoice found for billing run ${billingRun.id}`
      )
    }
    InvoiceId = invoice.id
    currency = invoice.currency
    CustomerProfileId = subscription.CustomerProfileId
    OrganizationId = subscription.OrganizationId
    livemode = subscription.livemode
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
    const invoiceAndLineItems = maybeInvoiceAndLineItems
    currency = invoiceAndLineItems.currency
    InvoiceId = invoiceAndLineItems.id
    OrganizationId = invoiceAndLineItems.OrganizationId!
    PurchaseId = invoiceAndLineItems.PurchaseId
    taxCountry = invoiceAndLineItems.taxCountry
    CustomerProfileId = invoiceAndLineItems.CustomerProfileId
    livemode = invoiceAndLineItems.livemode
  } else if ('purchaseSessionId' in paymentIntentMetadata) {
    const {
      purchaseSession,
      purchase: updatedPurchase,
      invoice,
    } = await processStripeChargeForPurchaseSession(
      {
        purchaseSessionId: paymentIntentMetadata.purchaseSessionId,
        charge,
      },
      transaction
    )
    if (purchaseSession.type === PurchaseSessionType.Invoice) {
      throw new Error(
        'Invoice checkout flow does not support charges'
      )
    }
    InvoiceId = invoice?.id ?? null
    currency = invoice?.currency ?? null
    OrganizationId = invoice?.OrganizationId!
    taxCountry = invoice?.taxCountry ?? null
    purchase = updatedPurchase
    PurchaseId = purchase?.id ?? null
    livemode = purchaseSession.livemode
    CustomerProfileId =
      purchase?.CustomerProfileId ||
      invoice?.CustomerProfileId ||
      null
  } else {
    throw new Error(
      'No invoice, purchase, or subscription found for payment intent'
    )
  }

  if (!OrganizationId) {
    throw new Error(
      `No organization found for payment intent ${paymentIntentId}`
    )
  }
  if (!InvoiceId) {
    throw new Error(
      `No invoice found for payment intent ${paymentIntentId}`
    )
  }
  if (!CustomerProfileId) {
    throw new Error(
      `No customer profile id found for payment intent ${paymentIntentId} with metadata: ${JSON.stringify(
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
    InvoiceId,
    chargeDate: dateFromStripeTimestamp(latestChargeDate),
    refunded: false,
    OrganizationId,
    PurchaseId,
    stripePaymentIntentId: paymentIntentId,
    paymentMethod: paymentMethodFromStripeCharge(charge),
    currency: currency ?? CurrencyCode.USD,
    refundedAt: null,
    taxCountry,
    stripeChargeId: stripeIdFromObjectOrId(charge),
    CustomerProfileId,
    livemode,
  }
  const [payment] = await upsertPaymentByStripeChargeId(
    paymentInsert,
    transaction
  )
  const latestPayment =
    await updatePaymentToReflectLatestChargeStatus(
      payment,
      charge.status,
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
  chargeStatus: Stripe.Charge.Status,
  transaction: DbTransaction
) => {
  const newPaymentStatus = chargeStatusToPaymentStatus(chargeStatus)
  let updatedPayment: Payment.Record = payment
  if (payment.status !== newPaymentStatus) {
    updatedPayment = await safelyUpdatePaymentStatus(
      payment,
      newPaymentStatus,
      transaction
    )
  }
  /**
   * Update associated invoice if it exists
   */
  if (payment.InvoiceId) {
    await updateInvoiceStatusToReflectLatestPayment(
      updatedPayment,
      transaction
    )
  }
  if (payment.PurchaseId) {
    /**
     * Update associated purchase if it exists
     */
    await updatePurchaseStatusToReflectLatestPayment(
      updatedPayment,
      transaction
    )
  }
  if (!payment.InvoiceId && !payment.PurchaseId) {
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
