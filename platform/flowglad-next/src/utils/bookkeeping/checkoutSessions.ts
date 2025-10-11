// checkoutSessions.ts
import {
  FeeCalculationType,
  InvoiceStatus,
  PaymentStatus,
  CheckoutSessionStatus,
  CheckoutSessionType,
  PurchaseStatus,
  PriceType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import {
  createStripeCustomer,
  stripeIdFromObjectOrId,
  updatePaymentIntent,
} from '@/utils/stripe'
import { Purchase } from '@/db/schema/purchases'
import { Event } from '@/db/schema/events'
import {
  selectPurchaseById,
  updatePurchase,
  upsertPurchaseById,
} from '@/db/tableMethods/purchaseMethods'
import {
  EditCheckoutSessionInput,
  feeReadyCheckoutSessionSelectSchema,
  CheckoutSession,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionObject,
} from '@/db/schema/checkoutSessions'
import {
  insertCheckoutSession,
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import {
  FeeCalculation,
  checkoutSessionFeeCalculationParametersChanged,
} from '@/db/schema/feeCalculations'
import {
  createCheckoutSessionFeeCalculation,
  createFeeCalculationForCheckoutSession,
  createInvoiceFeeCalculationForCheckoutSession,
} from '@/utils/bookkeeping/fees/checkoutSession'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
} from '@/utils/bookkeeping/fees/common'
import {
  selectDiscountRedemptions,
  upsertDiscountRedemptionForPurchaseAndDiscount,
} from '@/db/tableMethods/discountRedemptionMethods'
import {
  selectLatestFeeCalculation,
  updateFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import {
  insertCustomer,
  selectCustomers,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { Customer } from '@/db/schema/customers'
import { core } from '../core'
import { Discount } from '@/db/schema/discounts'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { createInitialInvoiceForPurchase } from './invoices'
import { Invoice } from '@/db/schema/invoices'
import Stripe from 'stripe'
import {
  safelyUpdateInvoiceStatus,
  selectInvoiceById,
} from '@/db/tableMethods/invoiceMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import { TransactionOutput } from '@/db/transactionEnhacementTypes'

export const editCheckoutSession = async (
  input: EditCheckoutSessionInput,
  transaction: DbTransaction
) => {
  const { checkoutSession, purchaseId } = input
  const previousCheckoutSession = await selectCheckoutSessionById(
    checkoutSession.id,
    transaction
  )

  if (!previousCheckoutSession) {
    throw new Error('Purchase session not found')
  }

  if (previousCheckoutSession.status !== CheckoutSessionStatus.Open) {
    throw new Error('Checkout session is not open')
  }
  /**
   * If the tax calculation has changed,
   * update the purchase session with the new tax calculation.
   */
  const updatedCheckoutSession = await updateCheckoutSession(
    {
      ...previousCheckoutSession,
      ...checkoutSession,
    } as CheckoutSession.Update,
    transaction
  )
  let feeCalculation: FeeCalculation.Record | null = null
  const result = feeReadyCheckoutSessionSelectSchema.safeParse(
    updatedCheckoutSession
  )

  const isFeeReady = result.success
  if (isFeeReady) {
    const feeReadySession = result.data
    const feeParametersChanged =
      checkoutSessionFeeCalculationParametersChanged({
        previousSession: previousCheckoutSession,
        currentSession: feeReadySession,
      })
    if (feeParametersChanged) {
      feeCalculation = await createFeeCalculationForCheckoutSession(
        feeReadySession,
        transaction
      )
    } else {
      feeCalculation = await selectLatestFeeCalculation(
        {
          checkoutSessionId: checkoutSession.id,
        },
        transaction
      )
    }
  }
  let purchase: Purchase.Record | null = null
  if (purchaseId) {
    purchase = await selectPurchaseById(purchaseId, transaction)
    if (!purchase) {
      throw new Error('Purchase not found')
    }
    if (purchase.status !== PurchaseStatus.Pending) {
      throw new Error('Purchase is not pending')
    }
    await updatePurchase(
      {
        id: purchase.id,
        billingAddress: checkoutSession.billingAddress,
        priceType: purchase.priceType,
      },
      transaction
    )
  }

  const stripePaymentIntentId =
    updatedCheckoutSession.stripePaymentIntentId
  /**
   * Only update the payment intent if the tax calculation has changed.
   * there's no need to update the payment intent before that.
   */
  if (stripePaymentIntentId && feeCalculation) {
    const totalDue = await calculateTotalDueAmount(feeCalculation)
    if (totalDue > 0) {
      const totalFeeAmount = calculateTotalFeeAmount(feeCalculation)
      await updatePaymentIntent(
        stripePaymentIntentId,
        {
          amount: totalDue,
          application_fee_amount: feeCalculation.livemode
            ? totalFeeAmount
            : undefined,
        },
        feeCalculation.livemode
      )
    }
  }
  return {
    checkoutSession: updatedCheckoutSession,
  }
}

/**
 * Handles the bookkeeping operations for a checkout session, managing customer, purchase, and fee records.
 *
 * @param checkoutSession - The checkout session record to process
 * @param providedStripeCustomerId - Optional Stripe customer ID to link with the customer
 * @param transaction - Database transaction for ensuring data consistency
 *
 * Operations performed:
 * 1. Fetches product and variant details for the purchase
 * 2. Resolves customer:
 *    - Uses existing customer if purchase exists
 *    - Finds customer by email/org
 *    - Creates new customer if needed
 * 3. Links Stripe customer:
 *    - Uses provided Stripe ID
 *    - Falls back to existing customer's Stripe ID
 *    - Creates new Stripe customer if needed
 * 4. Creates/updates purchase record with variant and product details
 * 5. Processes fee calculations for the purchase session
 * 6. Handles discount redemption if applicable
 *
 * @returns Object containing:
 *  - purchase: The created/updated purchase record
 *  - customer: The resolved customer
 *  - discount: The applied discount if any
 *  - feeCalculation: The updated fee calculation
 *  - discountRedemption: The created discount redemption if applicable
 */
export const processPurchaseBookkeepingForCheckoutSession = async (
  {
    checkoutSession,
    stripeCustomerId: providedStripeCustomerId,
  }: {
    checkoutSession: CheckoutSession.Record
    stripeCustomerId: string | null
  },
  transaction: DbTransaction
): Promise<TransactionOutput<{
  purchase: Purchase.Record
  customer: Customer.Record
  discount: Discount.Record | null
  feeCalculation: FeeCalculation.Record
  discountRedemption: DiscountRedemption.Record | null
}>> => {
  const [{ price, product }] =
    await selectPriceProductAndOrganizationByPriceWhere(
      { id: checkoutSession.priceId! },
      transaction
    )
  let customer: Customer.Record | null = null
  let purchase: Purchase.Record | null = null
  let customerEvents: Event.Insert[] = []
  let customerLedgerCommand: any = null
  if (checkoutSession.purchaseId) {
    purchase = await selectPurchaseById(
      checkoutSession.purchaseId,
      transaction
    )
    customer = await selectCustomerById(
      purchase.customerId!,
      transaction
    )
  }
  if (checkoutSession.customerId) {
    customer = await selectCustomerById(
      checkoutSession.customerId,
      transaction
    )
  }
  if (
    customer &&
    /**
     * This is important:
     * there is no providedStripeCustomerId if the checkout session is for a single guest payment.
     * In that case, we don't want to throw an error.
     */
    providedStripeCustomerId &&
    providedStripeCustomerId !== customer.stripeCustomerId
  ) {
    throw Error(
      `Attempting to process checkout session ${checkoutSession.id} with a different stripe customer ${providedStripeCustomerId} than the checkout session customer ${customer.stripeCustomerId} already linked to the purchase`
    )
  }
  if (providedStripeCustomerId) {
    const [customerWithStripeCustomerId] = await selectCustomers(
      {
        stripeCustomerId: providedStripeCustomerId,
      },
      transaction
    )
    customer = customerWithStripeCustomerId
  }
  if (!customer) {
    /**
     * Create a new customer if one doesn't exist.
     * Note: This knowingly creates customers with duplicate emails in the same organization.
     * Unfortunately this is the least worst option.
     * The alternative would be essentially allowing anonymous users
     * write access on existing customer organizations simply by guessing / inserting
     * the customer email.
     */
    const customerResult = await createCustomerBookkeeping(
      {
        customer: {
          email: checkoutSession.customerEmail!,
          name: checkoutSession.customerName ?? checkoutSession.customerEmail!,
          organizationId: product.organizationId,
          externalId: core.nanoid(),
          billingAddress: checkoutSession.billingAddress,
        },
      },
      {
        transaction,
        organizationId: product.organizationId,
        livemode: checkoutSession.livemode,
      }
    )
    customer = customerResult.result.customer
    
    // If we have a provided Stripe customer ID, update the customer with it
    if (providedStripeCustomerId && customer.stripeCustomerId !== providedStripeCustomerId) {
      customer = await updateCustomer(
        {
          id: customer.id,
          stripeCustomerId: providedStripeCustomerId,
        },
        transaction
      )
    }
    
    // Store events/ledger from customer creation to bubble up
    customerEvents = customerResult.eventsToInsert || []
    customerLedgerCommand = customerResult.ledgerCommand
  }
  if (!purchase) {
    const corePurchaseFields = {
      name: checkoutSession.outputName ?? product.name,
      organizationId: product.organizationId,
      customerId: customer.id,
      priceId: price.id,
      quantity: 1,
      billingAddress: checkoutSession.billingAddress,
      livemode: checkoutSession.livemode,
      metadata: checkoutSession.outputMetadata,
      status: PurchaseStatus.Open,
    } as const
    let purchaseInsert: Purchase.Insert
    if (price.type === PriceType.Subscription) {
      const subscriptionPurchaseInsert: Purchase.SubscriptionPurchaseInsert =
        {
          ...corePurchaseFields,
          intervalUnit: price.intervalUnit,
          intervalCount: price.intervalCount,
          firstInvoiceValue: 0,
          totalPurchaseValue: null,
          trialPeriodDays: price.trialPeriodDays ?? 0,
          priceType: PriceType.Subscription,
          pricePerBillingCycle: price.unitPrice,
        }
      purchaseInsert = subscriptionPurchaseInsert
    } else if (price.type === PriceType.SinglePayment) {
      const singlePaymentPurchaseInsert: Purchase.SinglePaymentPurchaseInsert =
        {
          ...corePurchaseFields,
          trialPeriodDays: null,
          intervalUnit: null,
          intervalCount: null,
          pricePerBillingCycle: null,
          firstInvoiceValue: price.unitPrice ?? 0,
          totalPurchaseValue: price.unitPrice,
          priceType: PriceType.SinglePayment,
        }
      purchaseInsert = singlePaymentPurchaseInsert
    } else if (price.type === PriceType.Usage) {
      const usagePurchaseInsert: Purchase.UsagePurchaseInsert = {
        ...corePurchaseFields,
        trialPeriodDays: null,
        intervalUnit: null,
        intervalCount: null,
        pricePerBillingCycle: null,
        firstInvoiceValue: price.unitPrice ?? 0,
        totalPurchaseValue: price.unitPrice,
        priceType: PriceType.Usage,
      }
      purchaseInsert = usagePurchaseInsert
    } else {
      throw new Error(
        `Unsupported price type for checkout session ${checkoutSession.id}`
      )
    }
    const results = await upsertPurchaseById(
      purchaseInsert,
      transaction
    )
    purchase = results[0]
  }
  let discount: Discount.Record | null = null
  let discountRedemption: DiscountRedemption.Record | null = null
  let feeCalculation: FeeCalculation.Record | null =
    await selectLatestFeeCalculation(
      {
        checkoutSessionId: checkoutSession.id,
      },
      transaction
    )
  if (!feeCalculation) {
    throw new Error(
      `No fee calculation found for purchase session ${checkoutSession.id}`
    )
  }
  feeCalculation = await updateFeeCalculation(
    {
      id: feeCalculation.id,
      purchaseId: purchase.id,
      type: FeeCalculationType.CheckoutSessionPayment,
      priceId: price.id,
      discountId: checkoutSession.discountId,
      billingPeriodId: null,
    },
    transaction
  )
  if (feeCalculation.discountId) {
    discount = await selectDiscountById(
      feeCalculation.discountId,
      transaction
    )
    discountRedemption =
      await upsertDiscountRedemptionForPurchaseAndDiscount(
        purchase,
        discount,
        transaction
      )
    if (!discountRedemption) {
      const redemptions = await selectDiscountRedemptions(
        {
          purchaseId: purchase.id,
          discountId: feeCalculation.discountId,
        },
        transaction
      )
      discountRedemption = redemptions[0]
    }
  }
  return {
    result: {
      purchase,
      customer,
      discount,
      feeCalculation,
      discountRedemption,
    },
    eventsToInsert: customerEvents,
    ledgerCommand: customerLedgerCommand,
  }
}

export const checkoutSessionStatusFromStripeCharge = (
  charge: Pick<Stripe.Charge, 'status'>
): CheckoutSessionStatus => {
  let checkoutSessionStatus = CheckoutSessionStatus.Succeeded
  if (charge.status === 'pending') {
    return CheckoutSessionStatus.Pending
  } else if (charge.status !== 'succeeded') {
    return CheckoutSessionStatus.Failed
  }
  return checkoutSessionStatus
}

/**
 * Processes a Stripe charge for an invoice-based checkout session.
 *
 * This function handles the bookkeeping when a charge is processed for an invoice:
 * 1. Validates the purchase session is for an invoice
 * 2. Updates the purchase session status based on the charge status
 * 3. Calculates total payments made against the invoice
 * 4. Updates invoice status based on payment status and amounts:
 *    - Marks as Paid if total payments >= invoice total
 *    - Marks as AwaitingPaymentConfirmation if charge is pending
 *    - Leaves status unchanged if payment succeeded but total < invoice amount
 *
 * @param checkoutSession - The purchase session record associated with the invoice
 * @param charge - The Stripe charge object containing payment details
 * @param transaction - Database transaction to use for all DB operations
 * @returns Updated purchase session and invoice records
 */
export const processStripeChargeForInvoiceCheckoutSession = async (
  {
    checkoutSession,
    charge,
  }: {
    checkoutSession: CheckoutSession.InvoiceRecord
    charge: Pick<Stripe.Charge, 'status' | 'amount'>
  },
  transaction: DbTransaction
): Promise<TransactionOutput<{
  checkoutSession: CheckoutSession.Record
  invoice: Invoice.Record
}>> => {
  const invoice = await selectInvoiceById(
    checkoutSession.invoiceId,
    transaction
  )
  const checkoutSessionStatus =
    checkoutSessionStatusFromStripeCharge(charge)
  const updatedCheckoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      status: checkoutSessionStatus,
    },
    transaction
  )
  const [invoiceAndLineItems] =
    await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
      {
        id: checkoutSession.invoiceId,
      },
      transaction
    )
  const invoiceTotal = invoiceAndLineItems.invoiceLineItems.reduce(
    (acc, lineItem) => acc + lineItem.price * lineItem.quantity,
    0
  )
  const successfulPaymentsForInvoice = await selectPayments(
    {
      invoiceId: checkoutSession.invoiceId,
      status: PaymentStatus.Succeeded,
    },
    transaction
  )
  const totalPriorPaymentsForInvoice =
    successfulPaymentsForInvoice.reduce(
      (acc, payment) => acc + payment.amount,
      0
    )
  if (totalPriorPaymentsForInvoice >= invoiceTotal) {
    const updatedInvoice = await safelyUpdateInvoiceStatus(
      invoice,
      InvoiceStatus.Paid,
      transaction
    )
    return {
      result: {
        checkoutSession: updatedCheckoutSession,
        invoice: updatedInvoice,
      },
      eventsToInsert: [],
    }
  }
  if (checkoutSessionStatus === CheckoutSessionStatus.Pending) {
    const updatedInvoice = await safelyUpdateInvoiceStatus(
      invoice,
      InvoiceStatus.AwaitingPaymentConfirmation,
      transaction
    )
    return {
      result: {
        checkoutSession: updatedCheckoutSession,
        invoice: updatedInvoice,
      },
      eventsToInsert: [],
    }
  } else if (
    checkoutSessionStatus === CheckoutSessionStatus.Succeeded
  ) {
    const totalPaymentsForInvoice =
      totalPriorPaymentsForInvoice + charge.amount
    if (totalPaymentsForInvoice >= invoiceTotal) {
      const updatedInvoice = await safelyUpdateInvoiceStatus(
        invoice,
        InvoiceStatus.Paid,
        transaction
      )
      return {
        result: {
          checkoutSession: updatedCheckoutSession,
          invoice: updatedInvoice,
        },
        eventsToInsert: [],
      }
    }
  }
  return {
    result: {
      checkoutSession: updatedCheckoutSession,
      invoice,
    },
    eventsToInsert: [],
  }
}

/**
 *
 * This method is used to process a Stripe charge for a checkout session.
 * It handles the bookkeeping for both invoice and product-based checkout sessions.
 * It will create the invoice for the checkout, but it will not modify the status of the invoice.
 *
 * That happens in methods that consume this one, or downstream in the codepath.
 * @param checkoutSessionId - The ID of the checkout session to process
 * @param charge - The Stripe charge object containing payment details
 * @param transaction - Database transaction to use for all DB operations
 * @returns Updated purchase, invoice, and checkout session records
 */
export const processStripeChargeForCheckoutSession = async (
  {
    checkoutSessionId,
    charge,
  }: {
    checkoutSessionId: string
    charge: Pick<
      Stripe.Charge,
      'status' | 'amount' | 'customer' | 'billing_details'
    >
  },
  transaction: DbTransaction
): Promise<TransactionOutput<{
  purchase: Purchase.Record | null
  invoice: Invoice.Record | null
  checkoutSession: CheckoutSession.Record
}>> => {
  let purchase: Purchase.Record | null = null
  let checkoutSession = await selectCheckoutSessionById(
    checkoutSessionId,
    transaction
  )

  let invoice: Invoice.Record | null = null
  let purchaseBookkeepingResult: Awaited<
    ReturnType<typeof processPurchaseBookkeepingForCheckoutSession>
  > | null = null;
  
  if (checkoutSession.type === CheckoutSessionType.Invoice) {
    const result = await processStripeChargeForInvoiceCheckoutSession(
      {
        checkoutSession,
        charge,
      },
      transaction
    )
    return {
      result: {
        purchase: null,
        invoice: result.result.invoice,
        checkoutSession: result.result.checkoutSession,
      },
      eventsToInsert: result.eventsToInsert,
      ledgerCommand: result.ledgerCommand,
    }
  }
  const checkoutSessionStatus =
    checkoutSessionStatusFromStripeCharge(charge)
  if (
    checkoutSessionStatus === CheckoutSessionStatus.Succeeded ||
    checkoutSessionStatus === CheckoutSessionStatus.Pending
  ) {
    purchaseBookkeepingResult =
      await processPurchaseBookkeepingForCheckoutSession(
        {
          checkoutSession,
          stripeCustomerId: charge.customer
            ? stripeIdFromObjectOrId(charge.customer)
            : null,
        },
        transaction
      )
    purchase = purchaseBookkeepingResult.result.purchase
    if (purchase) {
      const invoiceForPurchase = await createInitialInvoiceForPurchase(
        {
          purchase,
        },
        transaction
      )
      invoice = invoiceForPurchase.invoice
    }
  }
  checkoutSession = await updateCheckoutSession(
    {
      ...checkoutSession,
      status: checkoutSessionStatus,
      customerName: charge.billing_details?.name,
      customerEmail: charge.billing_details?.email,
      purchaseId: purchase?.id,
    } as CheckoutSession.Update,
    transaction
  )
  return {
    result: {
      purchase,
      invoice,
      checkoutSession,
    },
    eventsToInsert: purchaseBookkeepingResult?.eventsToInsert || [],
    ledgerCommand: purchaseBookkeepingResult?.ledgerCommand,
  }
}

// Re-export for backwards compatibility
export { createFeeCalculationForCheckoutSession }
