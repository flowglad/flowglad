import {
  CurrencyCode,
  PaymentStatus,
  CheckoutSessionType,
  Nullish,
  FlowgladEventType,
  EventNoun,
  PurchaseStatus,
  FeatureType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
  LedgerTransactionType,
  PriceType,
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
  IntentMetadataType,
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
import {
  selectCurrentSubscriptionForCustomer,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import { selectInvoices } from '@/db/tableMethods/invoiceMethods'
import { sendCustomerPaymentFailedNotificationIdempotently } from '@/trigger/notifications/send-customer-payment-failed-notification'
import { idempotentSendOrganizationPaymentFailedNotification } from '@/trigger/notifications/send-organization-payment-failed-notification'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'
import { Event } from '@/db/schema/events'
import {
  constructPaymentSucceededEventHash,
  constructPaymentFailedEventHash,
  constructPurchaseCompletedEventHash,
} from '@/utils/eventHelpers'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectProductPriceAndFeaturesByProductId } from '@/db/tableMethods/productMethods'
import {
  CreditGrantRecognizedLedgerCommand,
  LedgerCommand,
} from '@/db/ledgerManager/ledgerManagerTypes'
import { UsageCredit } from '@/db/schema/usageCredits'
import {
  bulkInsertOrDoNothingUsageCreditsByPaymentSubscriptionAndUsageMeter,
  insertUsageCredit,
} from '@/db/tableMethods/usageCreditMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'

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
  let organizationId: Nullish<string> = null
  let invoiceId: Nullish<string> = null
  let purchaseId: Nullish<string> = null
  let purchase: Nullish<Purchase.Record> = null
  let taxCountry: Nullish<CountryCode> = null
  let livemode: Nullish<boolean> = null
  let customerId: Nullish<string> = null
  let currency: Nullish<CurrencyCode> = null
  let subscriptionId: Nullish<string> = null
  if (paymentIntentMetadata.type === IntentMetadataType.BillingRun) {
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
  } else if (
    paymentIntentMetadata.type === IntentMetadataType.CheckoutSession
  ) {
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
      let [maybeInvoiceAndLineItems] =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          {
            id: checkoutSession.invoiceId,
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
    } else {
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
    }
    invoiceId = invoice?.id ?? null
    currency = invoice?.currency ?? null
    if (!checkoutSession.organizationId) {
      throw new Error(
        `Checkout session ${checkoutSession.id} does not have an organizationId`
      )
    }
    organizationId = checkoutSession.organizationId
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
  charge: Pick<
    Stripe.Charge,
    'status' | 'failure_code' | 'failure_message'
  >,
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
      updatedPayment = await updatePayment(
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
      await idempotentSendOrganizationPaymentFailedNotification({
        organizationId: updatedPayment.organizationId,
        customerId: updatedPayment.customerId,
        amount: updatedPayment.amount,
        currency: updatedPayment.currency,
        invoiceNumber: updatedPayment.invoiceId,
      })
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

export type CoreStripePaymentIntent = Pick<
  Stripe.PaymentIntent,
  'id' | 'metadata' | 'latest_charge' | 'status'
>

/**
 * A slightly odd method that applies usage credits for a single payment checkout session.
 * It's meant for pay go scenarios where the customer is topping up a specific usage meter.
 * - It only applies to payments from checkout sessions that are explictly associated with a single payment price
 * - It only applies if the customer has an active subscription (which, by default, they should due to free plans)
 * - It only applies if the associated product has usage credits as features associated with it
 * - It only applies the first usage credit feature associated with the product (this will create issues if there are somehow multiple usage credit features associated with the product - due to the way ledger commands only handle single usage credit grants.)
 *
 * @param params
 * @param transaction
 * @returns
 */
export const ledgerCommandForPaymentSucceeded = async (
  params: { priceId: string; payment: Payment.Record },
  transaction: DbTransaction
): Promise<CreditGrantRecognizedLedgerCommand | undefined> => {
  const price = await selectPriceById(params.priceId, transaction)
  if (price.type !== PriceType.SinglePayment) {
    return undefined
  }
  const { features } = await selectProductPriceAndFeaturesByProductId(
    price.productId,
    transaction
  )
  const usageCreditFeature = features.find(
    (feature) => feature.type === FeatureType.UsageCreditGrant
  )

  if (!usageCreditFeature) {
    return undefined
  }

  const subscription = await selectCurrentSubscriptionForCustomer(
    params.payment.customerId,
    transaction
  )
  if (!subscription) {
    return undefined
  }
  const { payment } = params
  const usageCreditInsert: UsageCredit.Insert = {
    issuedAmount: usageCreditFeature.amount,
    organizationId: subscription.organizationId,
    usageMeterId: usageCreditFeature.usageMeterId,
    creditType: UsageCreditType.Payment,
    status: UsageCreditStatus.Posted,
    subscriptionId: subscription.id,
    livemode: subscription.livemode,
    sourceReferenceId: payment.invoiceId,
    billingPeriodId: null,
    paymentId: payment.id,
    issuedAt: new Date(),
    expiresAt: null,
    sourceReferenceType:
      UsageCreditSourceReferenceType.InvoiceSettlement,
    metadata: {},
    notes: null,
  }
  const [usageCredit] =
    await bulkInsertOrDoNothingUsageCreditsByPaymentSubscriptionAndUsageMeter(
      [usageCreditInsert],
      transaction
    )
  /**
   * If the usage credit was not inserted because it already exists,
   * return undefined
   */
  if (!usageCredit) {
    return undefined
  }
  return {
    type: LedgerTransactionType.CreditGrantRecognized,
    payload: {
      usageCredit,
    },
    organizationId: subscription.organizationId,
    livemode: subscription.livemode,
    subscriptionId: subscription.id,
  }
}

/**
 * If the payment has already been marked succeeded, return.
 * Otherwise, we need to create a payment record and mark it succeeded.
 * @param paymentIntent
 * @param transaction
 * @returns
 */
export const processPaymentIntentStatusUpdated = async (
  paymentIntent: CoreStripePaymentIntent,
  transaction: DbTransaction
): Promise<TransactionOutput<{ payment: Payment.Record }>> => {
  const metadata = stripeIntentMetadataSchema.parse(
    paymentIntent.metadata
  )
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
  // Fetch customer data for event payload
  // Re-fetch purchase after update to get the latest status
  const purchase = payment.purchaseId
    ? await selectPurchaseById(payment.purchaseId, transaction)
    : null
  const customer = await selectCustomerById(
    payment.customerId,
    transaction
  )
  const timestamp = new Date()
  const eventInserts: Event.Insert[] = []
  let ledgerCommand: LedgerCommand | undefined
  if (paymentIntent.status === 'succeeded') {
    eventInserts.push({
      type: FlowgladEventType.PaymentSucceeded,
      occurredAt: timestamp,
      organizationId: payment.organizationId,
      livemode: payment.livemode,
      payload: {
        object: EventNoun.Payment,
        id: payment.id,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      submittedAt: timestamp,
      hash: constructPaymentSucceededEventHash(payment),
      metadata: {},
      processedAt: null,
    })
    if (metadata.type === IntentMetadataType.CheckoutSession) {
      const checkoutSession = await selectCheckoutSessionById(
        metadata.checkoutSessionId,
        transaction
      )
      if (checkoutSession.priceId) {
        ledgerCommand = await ledgerCommandForPaymentSucceeded(
          {
            priceId: checkoutSession.priceId,
            payment,
          },
          transaction
        )
      }
    }
  } else if (paymentIntent.status === 'canceled') {
    eventInserts.push({
      type: FlowgladEventType.PaymentFailed,
      occurredAt: timestamp,
      organizationId: payment.organizationId,
      livemode: payment.livemode,
      payload: {
        id: payment.id,
        object: EventNoun.Payment,
      },
      submittedAt: timestamp,
      hash: constructPaymentFailedEventHash(payment),
      metadata: {},
      processedAt: null,
    })
  }
  if (purchase && purchase.status === PurchaseStatus.Paid) {
    eventInserts.push({
      type: FlowgladEventType.PurchaseCompleted,
      occurredAt: timestamp,
      organizationId: payment.organizationId,
      livemode: payment.livemode,
      payload: {
        id: purchase.id,
        object: EventNoun.Purchase,
      },
      submittedAt: timestamp,
      hash: constructPurchaseCompletedEventHash(purchase),
      metadata: {},
      processedAt: null,
    })
  }
  return {
    result: { payment },
    eventsToInsert: eventInserts,
    ledgerCommand,
  }
}
