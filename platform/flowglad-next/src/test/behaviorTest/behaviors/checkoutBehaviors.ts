/**
 * Checkout Behaviors
 *
 * Behaviors representing the checkout flow for purchasing products.
 *
 * ## Product Context
 *
 * Checkout is the core purchase flow in Flowglad. Customers arrive at a
 * checkout session (via hosted page or embedded component), provide payment
 * details and billing address, and complete their purchase.
 *
 * ## User Journey
 *
 * 1. Organization creates products and prices
 * 2. Customer initiates checkout (via link, button, or API)
 * 3. Customer provides billing address
 * 4. Fee/tax calculation occurs (for MoR orgs)
 * 5. Customer provides payment method
 * 6. Payment is processed
 *
 * ## Key Behavioral Difference
 *
 * The checkout flow differs significantly based on contract type:
 *
 * - **MoR**: When billing address is provided, Flowglad calculates fees
 *   including tax. The feeCalculation record is created with tax details.
 * - **Platform**: No fee calculation occurs. The organization handles
 *   their own tax compliance outside of Flowglad.
 */

import { adminTransaction } from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Discount } from '@/db/schema/discounts'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { BillingAddress } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import { nulledPriceColumns } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import {
  insertCheckoutSession,
  updateCheckoutSession,
} from '@/db/tableMethods/checkoutSessionMethods'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertDiscount } from '@/db/tableMethods/discountMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  PaymentMethodType,
  PriceType,
} from '@/types'
import { editCheckoutSessionBillingAddress } from '@/utils/bookkeeping/checkoutSessions'
import core from '@/utils/core'
import { ContractTypeDep } from '../dependencies/contractTypeDependencies'
import { CustomerResidencyDep } from '../dependencies/customerResidencyDependencies'
import { DiscountDep } from '../dependencies/discountDependencies'
import { defineBehavior } from '../index'
import type { CompleteStripeOnboardingResult } from './stripeOnboardingBehaviors'

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of creating a product with price.
 *
 * Extends onboarded organization with the product catalog needed for checkout.
 */
export interface CreateProductWithPriceResult
  extends CompleteStripeOnboardingResult {
  /** The created product */
  product: Product.Record
  /** The created price for the product */
  price: Price.Record
  /** The pricing model used */
  pricingModel: PricingModel.Record
}

/**
 * Result of initiating a checkout session.
 *
 * Extends product setup with an active checkout session ready for
 * customer interaction.
 */
export interface InitiateCheckoutSessionResult
  extends CreateProductWithPriceResult {
  /** The created checkout session */
  checkoutSession: CheckoutSession.Record
  /** The customer ID for this checkout */
  customerId: string
}

/**
 * Result of applying a discount to checkout.
 *
 * Extends initiated checkout session with an optional discount.
 * If DiscountDep is 'none', discount will be null.
 */
export interface ApplyDiscountResult
  extends InitiateCheckoutSessionResult {
  /** The discount that was applied, or null if no discount */
  discount: Discount.Record | null
  /** The checkout session with discount linked */
  checkoutSessionWithDiscount: CheckoutSession.Record
}

/**
 * Result of providing a billing address.
 *
 * This is the key result that differs between MoR and Platform:
 * - MoR: feeCalculation is populated with tax details
 * - Platform: feeCalculation is null
 */
export interface ProvideBillingAddressResult
  extends ApplyDiscountResult {
  /** The checkout session with billing address set */
  updatedCheckoutSession: CheckoutSession.Record
  /** Fee calculation (MoR only, null for Platform) */
  feeCalculation: FeeCalculation.Record | null
  /** The billing address that was provided */
  billingAddress: BillingAddress
}

// =============================================================================
// Behaviors
// =============================================================================

/**
 * Create Product with Price Behavior
 *
 * Represents an organization setting up their product catalog.
 *
 * ## Real-World Flow
 *
 * In production, organizations create products via:
 * - Dashboard UI (most common)
 * - API calls (for programmatic setup)
 * - SDK methods (for integrated apps)
 *
 * ## What Gets Created
 *
 * - **Product**: The item being sold (name, description, images)
 * - **Price**: The pricing configuration (amount, currency, type)
 *
 * ## Postconditions
 *
 * - Product exists with:
 *   - `active`: true
 *   - `organizationId`: linked to the organization
 *   - `pricingModelId`: linked to default pricing model
 * - Price exists with:
 *   - `type`: SinglePayment (one-time purchase)
 *   - `unitPrice`: 5000 ($50.00)
 *   - `currency`: USD (MoR) or organization's default currency (Platform)
 *   - `productId`: linked to the product
 */
export const createProductWithPriceBehavior = defineBehavior({
  name: 'create product with price',
  dependencies: [ContractTypeDep],
  run: async (
    { contractTypeDep },
    prev: CompleteStripeOnboardingResult
  ): Promise<CreateProductWithPriceResult> => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const pricingModel = await selectDefaultPricingModel(
        { organizationId: prev.organization.id, livemode: true },
        transaction
      )

      if (!pricingModel) {
        throw new Error('Default pricing model not found')
      }

      const product = await insertProduct(
        {
          name: `Test Product ${core.nanoid()}`,
          organizationId: prev.organization.id,
          livemode: true,
          description: 'Test product for checkout behavior test',
          imageURL: null,
          active: true,
          singularQuantityLabel: 'item',
          pluralQuantityLabel: 'items',
          pricingModelId: pricingModel.id,
          externalId: null,
          default: false,
          slug: `test-product-${core.nanoid()}`,
        },
        ctx
      )

      const price = await insertPrice(
        {
          ...nulledPriceColumns,
          productId: product.id,
          name: 'Single Payment Price',
          type: PriceType.SinglePayment,
          unitPrice: 5000, // $50.00
          livemode: true,
          active: true,
          isDefault: true,
          currency: contractTypeDep.getCurrency(
            prev.organization.defaultCurrency
          ),
          externalId: null,
          slug: `test-price-${core.nanoid()}`,
        },
        ctx
      )

      return { product, price, pricingModel }
    })

    return {
      ...prev,
      ...result,
    }
  },
})

/**
 * Initiate Checkout Session Behavior
 *
 * Represents a customer starting the checkout process.
 *
 * ## Real-World Flow
 *
 * In production, checkout sessions are initiated when:
 * - Customer clicks a "Buy" button (creates session + redirects)
 * - Organization creates session via API (returns URL)
 * - Embedded checkout component mounts (creates session client-side)
 *
 * ## What Gets Created
 *
 * - **Customer**: Record for the purchasing customer
 * - **Checkout Session**: The active purchase session
 *
 * ## Postconditions
 *
 * - Customer exists with email and Stripe customer ID
 * - Checkout session exists with:
 *   - `status`: Open (ready for customer input)
 *   - `billingAddress`: null (not yet provided)
 *   - `priceId`: linked to the price being purchased
 *   - `quantity`: 1
 */
export const initiateCheckoutSessionBehavior = defineBehavior({
  name: 'initiate checkout session',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateProductWithPriceResult
  ): Promise<InitiateCheckoutSessionResult> => {
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Create anonymous customer
      const customer = await insertCustomer(
        {
          organizationId: prev.organization.id,
          email: `customer+${core.nanoid()}@test.com`,
          name: 'Test Customer',
          externalId: core.nanoid(),
          livemode: true,
          stripeCustomerId: `cus_${core.nanoid()}`,
          invoiceNumberBase: core.nanoid(),
          pricingModelId: prev.pricingModel.id,
        },
        transaction
      )

      // Create checkout session without billing address
      const checkoutSession = await insertCheckoutSession(
        {
          organizationId: prev.organization.id,
          customerId: customer.id,
          customerEmail: customer.email,
          customerName: customer.name,
          priceId: prev.price.id,
          status: CheckoutSessionStatus.Open,
          type: CheckoutSessionType.Product,
          quantity: 1,
          livemode: true,
          targetSubscriptionId: null,
          outputName: null,
          invoiceId: null,
          outputMetadata: {},
          automaticallyUpdateSubscriptions: null,
          preserveBillingCycleAnchor: false,
          billingAddress: null,
          paymentMethodType: PaymentMethodType.Card,
        },
        transaction
      )

      return {
        customerId: customer.id,
        checkoutSession,
      }
    })

    return {
      ...prev,
      ...result,
    }
  },
})

/**
 * Apply Discount Behavior
 *
 * Represents the customer entering a discount code during checkout.
 *
 * ## Real-World Flow
 *
 * In production, this happens when the customer enters a promo code
 * in the checkout UI. The code is validated and the discount is linked
 * to the checkout session.
 *
 * ## Impact on Fee Calculation
 *
 * The discount affects fee calculation for MoR organizations:
 * - `discountAmountFixed` is set based on discount type and amount
 * - `pretaxTotal` = baseAmount - discountAmountFixed
 * - Tax is calculated on the pretaxTotal (post-discount amount)
 *
 * ## Postconditions
 *
 * - If DiscountDep has a discount:
 *   - Discount record is created for the organization
 *   - Checkout session `discountId` is set
 * - If DiscountDep is 'none':
 *   - No discount record is created
 *   - Checkout session `discountId` remains null
 */
export const applyDiscountBehavior = defineBehavior({
  name: 'apply discount',
  dependencies: [DiscountDep],
  run: async (
    { discountDep },
    prev: InitiateCheckoutSessionResult
  ): Promise<ApplyDiscountResult> => {
    const { discountInsert } = discountDep

    // If no discount, just pass through
    if (!discountInsert) {
      return {
        ...prev,
        discount: null,
        checkoutSessionWithDiscount: prev.checkoutSession,
      }
    }

    // Create the discount and link it to the checkout session
    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      // Create discount for this organization
      const discount = await insertDiscount(
        {
          ...discountInsert,
          organizationId: prev.organization.id,
          pricingModelId: prev.pricingModel.id,
          livemode: true,
        },
        transaction
      )

      // Update checkout session with discount
      const checkoutSessionWithDiscount = await updateCheckoutSession(
        {
          ...prev.checkoutSession,
          discountId: discount.id,
        },
        transaction
      )

      return {
        discount,
        checkoutSessionWithDiscount,
      }
    })

    return {
      ...prev,
      ...result,
    }
  },
})

/**
 * Provide Billing Address Behavior
 *
 * Represents the customer entering their billing address during checkout.
 *
 * ## Real-World Flow
 *
 * In production, this happens when the customer fills out the billing
 * address form in the checkout UI. The address is validated and saved,
 * triggering fee calculation for MoR organizations.
 *
 * ## The Key MoR vs Platform Difference
 *
 * This behavior is where the contract type has its most visible impact:
 *
 * - **MoR Organizations**: Providing a billing address triggers
 *   `editCheckoutSessionBillingAddress`, which calculates fees including
 *   applicable taxes based on the customer's jurisdiction. A FeeCalculation
 *   record is created with tax breakdown.
 *
 * - **Platform Organizations**: The billing address is saved, but no
 *   fee calculation occurs. The organization handles tax compliance
 *   separately, outside of Flowglad.
 *
 * ## Postconditions
 *
 * - Checkout session has `billingAddress` set to the provided address
 * - For MoR:
 *   - `feeCalculation` is NOT null
 *   - `feeCalculation.checkoutSessionId` links to the session
 *   - `feeCalculation.morSurchargePercentage` > 0
 * - For Platform:
 *   - `feeCalculation` IS null
 */
export const provideBillingAddressBehavior = defineBehavior({
  name: 'provide billing address',
  dependencies: [CustomerResidencyDep],
  run: async (
    { customerResidencyDep },
    prev: ApplyDiscountResult | InitiateCheckoutSessionResult
  ): Promise<ProvideBillingAddressResult> => {
    const billingAddress = customerResidencyDep.billingAddress

    // Use the checkout session with discount if available, otherwise use the base checkout session
    // This allows the behavior to work both with and without the applyDiscountBehavior in the chain
    const checkoutSessionId =
      'checkoutSessionWithDiscount' in prev
        ? prev.checkoutSessionWithDiscount.id
        : prev.checkoutSession.id

    const result = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      const {
        checkoutSession: updatedCheckoutSession,
        feeCalculation,
      } = await editCheckoutSessionBillingAddress(
        {
          checkoutSessionId,
          billingAddress,
        },
        transaction
      )

      return {
        updatedCheckoutSession,
        feeCalculation,
      }
    })

    // Build the checkoutSessionWithDiscount value:
    // - If we had a discount applied, use that session
    // - Otherwise, use the updated checkout session (which has the billing address)
    const checkoutSessionWithDiscount =
      'checkoutSessionWithDiscount' in prev
        ? prev.checkoutSessionWithDiscount
        : result.updatedCheckoutSession

    return {
      ...prev,
      ...result,
      billingAddress,
      // Ensure checkoutSessionWithDiscount is set for downstream behaviors
      checkoutSessionWithDiscount,
      // discount is null if not present in prev
      discount: 'discount' in prev ? prev.discount : null,
    }
  },
})
