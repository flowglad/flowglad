// checkoutSessions.ts

import {
  CheckoutSessionStatus,
  FeeCalculationType,
  PriceType,
  PurchaseStatus,
  StripeConnectContractType,
} from '@db-core/enums'
import {
  type CheckoutSession,
  CreateCheckoutSessionInput,
  CreateCheckoutSessionObject,
  type EditCheckoutSessionInput,
  feeReadyCheckoutSessionSelectSchema,
} from '@db-core/schema/checkoutSessions'
import type { Customer } from '@db-core/schema/customers'
import type { DiscountRedemption } from '@db-core/schema/discountRedemptions'
import type { Discount } from '@db-core/schema/discounts'
import type { Event } from '@db-core/schema/events'
import {
  checkoutSessionFeeCalculationParametersChanged,
  type FeeCalculation,
} from '@db-core/schema/feeCalculations'
import type { Invoice } from '@db-core/schema/invoices'
import type { BillingAddress } from '@db-core/schema/organizations'
import type { Purchase } from '@db-core/schema/purchases'
import type Stripe from 'stripe'
import {
  insertCheckoutSession,
  selectCheckoutSessionById,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import {
  insertCustomer,
  selectCustomerById,
  selectCustomers,
  updateCustomer,
} from '@/db/tableMethods/customerMethods'
import { selectDiscountById } from '@/db/tableMethods/discountMethods'
import {
  selectDiscountRedemptions,
  upsertDiscountRedemptionForPurchaseAndDiscount,
} from '@/db/tableMethods/discountRedemptionMethods'
import {
  selectLatestFeeCalculation,
  updateFeeCalculation,
} from '@/db/tableMethods/feeCalculationMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPriceProductAndOrganizationByPriceWhere } from '@/db/tableMethods/priceMethods'
import {
  selectPurchaseById,
  updatePurchase,
  upsertPurchaseById,
} from '@/db/tableMethods/purchaseMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { createCustomerBookkeeping } from '@/utils/bookkeeping'
import {
  createCheckoutSessionFeeCalculation,
  createFeeCalculationForCheckoutSession,
} from '@/utils/bookkeeping/fees/checkoutSession'
import {
  calculateTotalDueAmount,
  calculateTotalFeeAmount,
} from '@/utils/bookkeeping/fees/common'
import { CacheDependency } from '@/utils/cache'
import {
  createStripeCustomer,
  stripeIdFromObjectOrId,
  updatePaymentIntent,
} from '@/utils/stripe'
import { core } from '../core'
import { createInitialInvoiceForPurchase } from './invoices'

export const editCheckoutSession = async (
  input: EditCheckoutSessionInput,
  ctx: TransactionEffectsContext
) => {
  const { transaction, invalidateCache } = ctx
  const { checkoutSession, purchaseId } = input
  const previousCheckoutSession = (
    await selectCheckoutSessionById(checkoutSession.id, transaction)
  ).unwrap()

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
    purchase = (
      await selectPurchaseById(purchaseId, transaction)
    ).unwrap()
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
    // Invalidate purchase cache after updating purchase content (billing address)
    invalidateCache(CacheDependency.purchase(purchase.id))
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
 * Updates the billing address on a checkout session and triggers fee calculation for MOR organizations.
 *
 * For MOR (Merchant of Record) organizations, this function calculates tax immediately when
 * the billing address is set, rather than waiting for confirmation. This ensures customers
 * see the correct total (including tax) before clicking "Pay".
 *
 * For Platform organizations, this simply updates the billing address without tax calculation.
 *
 * @param input - Object containing checkoutSessionId and billingAddress
 * @param transaction - Database transaction
 * @returns Updated checkout session and fee calculation (if applicable)
 */
export const editCheckoutSessionBillingAddress = async (
  input: {
    checkoutSessionId: string
    billingAddress: BillingAddress
  },
  transaction: DbTransaction
): Promise<{
  checkoutSession: CheckoutSession.Record
  feeCalculation: FeeCalculation.Record | null
}> => {
  const previousCheckoutSession = (
    await selectCheckoutSessionById(
      input.checkoutSessionId,
      transaction
    )
  ).unwrap()

  if (previousCheckoutSession.status !== CheckoutSessionStatus.Open) {
    throw new Error('Checkout session is not open')
  }

  // Update the checkout session with new billing address
  const updatedCheckoutSession = await updateCheckoutSession(
    {
      ...previousCheckoutSession,
      billingAddress: input.billingAddress,
    } as CheckoutSession.Update,
    transaction
  )

  // Check if we should calculate fees (MOR orgs only, and only if fee-ready)
  const organization = (
    await selectOrganizationById(
      updatedCheckoutSession.organizationId,
      transaction
    )
  ).unwrap()

  let feeCalculation: FeeCalculation.Record | null = null

  // Only calculate fees for MOR organizations
  if (
    organization.stripeConnectContractType ===
    StripeConnectContractType.MerchantOfRecord
  ) {
    const feeReadyResult =
      feeReadyCheckoutSessionSelectSchema.safeParse(
        updatedCheckoutSession
      )

    if (feeReadyResult.success) {
      const feeReadySession = feeReadyResult.data
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
          { checkoutSessionId: input.checkoutSessionId },
          transaction
        )
      }

      // Update payment intent if exists and fee calculation is ready
      const stripePaymentIntentId =
        updatedCheckoutSession.stripePaymentIntentId
      if (stripePaymentIntentId && feeCalculation) {
        const totalDue = await calculateTotalDueAmount(feeCalculation)
        if (totalDue > 0) {
          const totalFeeAmount =
            calculateTotalFeeAmount(feeCalculation)
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
    }
  }

  return {
    checkoutSession: updatedCheckoutSession,
    feeCalculation,
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
  ctx: TransactionEffectsContext
): Promise<{
  purchase: Purchase.Record
  customer: Customer.Record
  discount: Discount.Record | null
  feeCalculation: FeeCalculation.Record
  discountRedemption: DiscountRedemption.Record | null
}> => {
  const { transaction, emitEvent, enqueueLedgerCommand } = ctx
  const [{ price, product }] =
    await selectPriceProductAndOrganizationByPriceWhere(
      { id: checkoutSession.priceId! },
      transaction
    )
  // Product checkout requires a product - usage prices (with null product) are not supported here
  if (!product) {
    throw new Error(
      'Purchase bookkeeping is only supported for product prices (subscription/single payment), not usage prices'
    )
  }
  let customer: Customer.Record | null = null
  let purchase: Purchase.Record | null = null

  // Step 1: Try to find existing customer by checkout session customer ID (logged-in user)
  if (checkoutSession.purchaseId) {
    purchase = (
      await selectPurchaseById(
        checkoutSession.purchaseId,
        transaction
      )
    ).unwrap()
    customer = (
      await selectCustomerById(purchase.customerId!, transaction)
    ).unwrap()
  }
  if (checkoutSession.customerId) {
    customer = (
      await selectCustomerById(
        checkoutSession.customerId,
        transaction
      )
    ).unwrap()
  }

  // Step 2: Validate that provided Stripe customer ID matches existing customer
  if (
    customer &&
    providedStripeCustomerId &&
    providedStripeCustomerId !== customer.stripeCustomerId
  ) {
    throw Error(
      `Attempting to process checkout session ${checkoutSession.id} with a different stripe customer ${providedStripeCustomerId} than the checkout session customer ${customer.stripeCustomerId} already linked to the purchase`
    )
  }

  // Step 3: If we have a providedStripeCustomerId, try to find existing customer by Stripe ID
  if (!customer && providedStripeCustomerId) {
    const [customerWithStripeCustomerId] = await selectCustomers(
      {
        stripeCustomerId: providedStripeCustomerId,
      },
      transaction
    )
    customer = customerWithStripeCustomerId
  }

  // Step 4: If still no customer, create one
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
          name:
            checkoutSession.customerName ??
            checkoutSession.customerEmail!,
          organizationId: product.organizationId,
          externalId: core.nanoid(),
          billingAddress: checkoutSession.billingAddress,
          stripeCustomerId: providedStripeCustomerId,
        },
      },
      {
        transaction,
        cacheRecomputationContext: ctx.cacheRecomputationContext,
        organizationId: product.organizationId,
        livemode: checkoutSession.livemode,
        invalidateCache: ctx.invalidateCache,
        emitEvent,
        enqueueLedgerCommand,
        enqueueTriggerTask: ctx.enqueueTriggerTask,
      }
    )
    customer = customerResult.customer
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
    } else {
      throw new Error(
        `Unsupported price type for checkout session ${checkoutSession.id}`
      )
    }
    const result = await upsertPurchaseById(
      purchaseInsert,
      transaction
    )
    purchase = result
    // Invalidate purchase cache after creating/updating purchase
    ctx.invalidateCache(
      CacheDependency.customerPurchases(customer.id)
    )
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
    discount = (
      await selectDiscountById(feeCalculation.discountId, transaction)
    ).unwrap()
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
    purchase,
    customer,
    discount,
    feeCalculation,
    discountRedemption,
  }
}

export const checkoutSessionStatusFromStripeCharge = (
  charge: Pick<Stripe.Charge, 'status'>
): CheckoutSessionStatus => {
  const checkoutSessionStatus = CheckoutSessionStatus.Succeeded
  if (charge.status === 'pending') {
    return CheckoutSessionStatus.Pending
  } else if (charge.status !== 'succeeded') {
    return CheckoutSessionStatus.Failed
  }
  return checkoutSessionStatus
}

/**
 *
 * This method is used to process a Stripe charge for a checkout session.
 * It handles the bookkeeping for product-based checkout sessions.
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
  ctx: TransactionEffectsContext
): Promise<{
  purchase: Purchase.Record | null
  invoice: Invoice.Record | null
  checkoutSession: CheckoutSession.Record
}> => {
  const { transaction } = ctx
  let purchase: Purchase.Record | null = null
  let checkoutSession = (
    await selectCheckoutSessionById(checkoutSessionId, transaction)
  ).unwrap()

  let invoice: Invoice.Record | null = null

  const checkoutSessionStatus =
    checkoutSessionStatusFromStripeCharge(charge)
  if (
    checkoutSessionStatus === CheckoutSessionStatus.Succeeded ||
    checkoutSessionStatus === CheckoutSessionStatus.Pending
  ) {
    const purchaseBookkeepingResult =
      await processPurchaseBookkeepingForCheckoutSession(
        {
          checkoutSession,
          stripeCustomerId: charge.customer
            ? stripeIdFromObjectOrId(charge.customer)
            : null,
        },
        ctx
      )
    purchase = purchaseBookkeepingResult.purchase
    if (purchase) {
      const invoiceForPurchase =
        await createInitialInvoiceForPurchase(
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
    purchase,
    invoice,
    checkoutSession,
  }
}

// Re-export for backwards compatibility
export { createFeeCalculationForCheckoutSession }
