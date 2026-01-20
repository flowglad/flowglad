import type Stripe from 'stripe'
import type { CreditGrantRecognizedLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { Payment } from '@/db/schema/payments'
import { Price } from '@/db/schema/prices'
import type { Purchase } from '@/db/schema/purchases'
import type { UsageCredit } from '@/db/schema/usageCredits'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { selectCheckoutSessionById } from '@/db/tableMethods/checkoutSessionMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectLatestFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { selectInvoices } from '@/db/tableMethods/invoiceMethods'
import {
  safelyUpdatePaymentStatus,
  updatePayment,
  upsertPaymentByStripeChargeId,
} from '@/db/tableMethods/paymentMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductPriceAndFeaturesByProductId } from '@/db/tableMethods/productMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import {
  selectCurrentSubscriptionForCustomer,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import { bulkInsertOrDoNothingUsageCreditsByPaymentSubscriptionAndUsageMeter } from '@/db/tableMethods/usageCreditMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { sendCustomerPaymentFailedNotificationIdempotently } from '@/trigger/notifications/send-customer-payment-failed-notification'
import { idempotentSendOrganizationPaymentFailedNotification } from '@/trigger/notifications/send-organization-payment-failed-notification'
import {
  type CountryCode,
  CurrencyCode,
  EventNoun,
  FeatureType,
  FlowgladEventType,
  LedgerTransactionType,
  type Nullish,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { isNil } from '@/utils/core'
import {
  constructPaymentFailedEventHash,
  constructPaymentSucceededEventHash,
  constructPurchaseCompletedEventHash,
} from '@/utils/eventHelpers'
import { dateFromStripeTimestamp } from '@/utils/stripe'
import {
  updateInvoiceStatusToReflectLatestPayment,
  updatePurchaseStatusToReflectLatestPayment,
} from '../bookkeeping'
import {
  getStripeCharge,
  IntentMetadataType,
  paymentMethodFromStripeCharge,
  type StripeIntentMetadata,
  stripeIdFromObjectOrId,
  stripeIntentMetadataSchema,
} from '../stripe'
import { processStripeChargeForCheckoutSession } from './checkoutSessions'

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

export const selectFeeCalculationForPaymentIntent = async (
  params: { type: IntentMetadataType } & (
    | { type: IntentMetadataType.BillingRun; billingPeriodId: string }
    | {
        type: IntentMetadataType.CheckoutSession
        checkoutSessionId: string
      }
  ),
  transaction: DbTransaction
): Promise<FeeCalculation.Record | null> => {
  if (params.type === IntentMetadataType.BillingRun) {
    return selectLatestFeeCalculation(
      { billingPeriodId: params.billingPeriodId },
      transaction
    )
  }
  return selectLatestFeeCalculation(
    { checkoutSessionId: params.checkoutSessionId },
    transaction
  )
}

export const upsertPaymentForStripeCharge = async (
  {
    charge,
    paymentIntentMetadata,
  }: {
    charge: Stripe.Charge
    paymentIntentMetadata: StripeIntentMetadata
  },
  ctx: TransactionEffectsContext
): Promise<{
  payment: Payment.Record
}> => {
  const { transaction, emitEvent } = ctx
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
  let feeCalculation: FeeCalculation.Record | null = null
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
    feeCalculation = await selectFeeCalculationForPaymentIntent(
      {
        type: IntentMetadataType.BillingRun,
        billingPeriodId: billingRun.billingPeriodId,
      },
      transaction
    )
  } else if (
    paymentIntentMetadata.type === IntentMetadataType.CheckoutSession
  ) {
    feeCalculation = await selectFeeCalculationForPaymentIntent(
      {
        type: IntentMetadataType.CheckoutSession,
        checkoutSessionId: paymentIntentMetadata.checkoutSessionId,
      },
      transaction
    )
    const {
      checkoutSession,
      purchase: updatedPurchase,
      invoice,
    } = await processStripeChargeForCheckoutSession(
      {
        checkoutSessionId: paymentIntentMetadata.checkoutSessionId,
        charge,
      },
      ctx
    )
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
    chargeDate: dateFromStripeTimestamp(latestChargeDate).getTime(),
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
    ...(feeCalculation
      ? {
          subtotal: feeCalculation.pretaxTotal,
          taxAmount: feeCalculation.taxAmountFixed,
          stripeTaxCalculationId:
            feeCalculation.stripeTaxCalculationId,
          stripeTaxTransactionId:
            feeCalculation.stripeTaxTransactionId,
        }
      : {}),
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
  return {
    payment: latestPayment,
  }
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
  updatedPayment = await safelyUpdatePaymentStatus(
    payment,
    newPaymentStatus,
    transaction
  )
  // Only send notifications when payment status actually changes to Failed
  // (prevents duplicate notifications on webhook retries for already-failed payments)
  if (
    newPaymentStatus === PaymentStatus.Failed &&
    payment.status !== newPaymentStatus
  ) {
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
      paymentId: updatedPayment.id,
      organizationId: updatedPayment.organizationId,
      customerId: updatedPayment.customerId,
      amount: updatedPayment.amount,
      currency: updatedPayment.currency,
      invoiceNumber: updatedPayment.invoiceId,
      failureReason:
        updatedPayment.failureMessage ||
        updatedPayment.failureCode ||
        undefined,
      livemode: updatedPayment.livemode,
    })
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
  // Use type guard for consistent pattern and proper TypeScript narrowing
  if (
    !Price.hasProductId(price) ||
    price.type !== PriceType.SinglePayment
  ) {
    return undefined
  }
  const { features } = await selectProductPriceAndFeaturesByProductId(
    price.productId,
    transaction
  )

  const usageCreditFeature = features
    .sort((a, b) => a.position - b.position)
    .find((feature) => feature.type === FeatureType.UsageCreditGrant)

  if (!usageCreditFeature) {
    return undefined
  }

  if (
    usageCreditFeature.amount === null ||
    usageCreditFeature.amount === undefined ||
    usageCreditFeature.amount < 1
  ) {
    throw new Error(
      `Usage credit feature for ${usageCreditFeature.id} too small: expected number to be >0`
    )
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
    issuedAt: Date.now(),
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
 * @param ctx
 * @returns
 */
export const processPaymentIntentStatusUpdated = async (
  paymentIntent: CoreStripePaymentIntent,
  ctx: TransactionEffectsContext
): Promise<{ payment: Payment.Record }> => {
  const { transaction, emitEvent, enqueueLedgerCommand } = ctx
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
    paymentIntent.latest_charge
  )
  const latestCharge = await getStripeCharge(latestChargeId)
  if (!latestCharge) {
    throw new Error(
      `No charge found for payment intent ${paymentIntent.id}`
    )
  }
  const { payment } = await upsertPaymentForStripeCharge(
    {
      charge: latestCharge,
      paymentIntentMetadata: stripeIntentMetadataSchema.parse(
        paymentIntent.metadata
      ),
    },
    ctx
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
  const timestamp = Date.now()
  if (paymentIntent.status === 'succeeded') {
    emitEvent({
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
        const ledgerCommand = await ledgerCommandForPaymentSucceeded(
          {
            priceId: checkoutSession.priceId,
            payment,
          },
          transaction
        )
        if (ledgerCommand) {
          enqueueLedgerCommand(ledgerCommand)
        }
      }
    }
  } else if (paymentIntent.status === 'canceled') {
    emitEvent({
      type: FlowgladEventType.PaymentFailed,
      occurredAt: timestamp,
      organizationId: payment.organizationId,
      livemode: payment.livemode,
      payload: {
        id: payment.id,
        object: EventNoun.Payment,
        customer: {
          id: customer.id,
          externalId: customer.externalId,
        },
      },
      submittedAt: timestamp,
      hash: constructPaymentFailedEventHash(payment),
      metadata: {},
      processedAt: null,
    })
  }
  if (purchase && purchase.status === PurchaseStatus.Paid) {
    const purchaseCustomer = await selectCustomerById(
      purchase.customerId,
      transaction
    )

    if (!purchaseCustomer) {
      throw new Error(
        `Customer not found for purchase ${purchase.id}`
      )
    }

    emitEvent({
      type: FlowgladEventType.PurchaseCompleted,
      occurredAt: timestamp,
      organizationId: payment.organizationId,
      livemode: payment.livemode,
      payload: {
        id: purchase.id,
        object: EventNoun.Purchase,
        customer: {
          id: purchaseCustomer.id,
          externalId: purchaseCustomer.externalId,
        },
      },
      submittedAt: timestamp,
      hash: constructPurchaseCompletedEventHash(purchase),
      metadata: {},
      processedAt: null,
    })
  }
  return { payment }
}
