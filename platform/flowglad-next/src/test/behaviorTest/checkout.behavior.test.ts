/**
 * Checkout Behavior Test
 *
 * Tests the checkout flow across different contract types (MOR vs Platform)
 * and customer residencies.
 *
 * Chain:
 * 1. Create Organization (with Stripe onboarding complete)
 * 2. Create Product with Price
 * 3. Initiate Checkout Session
 * 4. Provide Billing Address
 *
 * Key invariant: Fee calculation (including tax) is only performed for MOR
 * orgs when billing address is provided. Platform orgs get null fee calculation.
 */

import { expect } from 'vitest'
import { teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { FeeCalculation } from '@/db/schema/feeCalculations'
import type { BillingAddress } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import { nulledPriceColumns } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import { insertCheckoutSession } from '@/db/tableMethods/checkoutSessionMethods'
import { insertCustomer } from '@/db/tableMethods/customerMethods'
import { insertPrice } from '@/db/tableMethods/priceMethods'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import {
  CheckoutSessionStatus,
  CheckoutSessionType,
  CountryCode,
  CurrencyCode,
  PaymentMethodType,
  PriceType,
  StripeConnectContractType,
} from '@/types'
import { editCheckoutSessionBillingAddress } from '@/utils/bookkeeping/checkoutSessions'
import core from '@/utils/core'
import {
  authenticateUserBehavior,
  type CompleteStripeOnboardingResult,
  ContractTypeDep,
  completeStripeOnboardingBehavior,
  createOrganizationBehavior,
} from './behaviors/organizationBehaviors'
import { behaviorTest, Dependency, defineBehavior } from './index'

// ============================================================================
// Result Types
// ============================================================================

interface CreateProductWithPriceResult
  extends CompleteStripeOnboardingResult {
  product: Product.Record
  price: Price.Record
}

interface InitiateCheckoutSessionResult
  extends CreateProductWithPriceResult {
  checkoutSession: CheckoutSession.Record
  customerId: string
}

interface ProvideBillingAddressResult
  extends InitiateCheckoutSessionResult {
  updatedCheckoutSession: CheckoutSession.Record
  feeCalculation: FeeCalculation.Record | null
  billingAddress: BillingAddress
}

// ============================================================================
// Dependency Definitions
// ============================================================================

/**
 * CustomerResidencyDep - Defines where the customer is located.
 * Different residencies have different tax implications (for MOR orgs).
 */
interface CustomerResidencyConfig {
  billingAddress: BillingAddress
  description: string
}

abstract class CustomerResidencyDep extends Dependency<CustomerResidencyConfig>() {
  abstract billingAddress: BillingAddress
  abstract description: string
}

// ============================================================================
// Dependency Implementations
// ============================================================================

// Customer residency implementations
CustomerResidencyDep.implement('us-nyc', {
  description: 'US customer in NYC',
  billingAddress: {
    address: {
      line1: '123 Broadway',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: CountryCode.US,
    },
  },
})

CustomerResidencyDep.implement('eu-london', {
  description: 'EU customer in London',
  billingAddress: {
    address: {
      line1: '10 Downing Street',
      city: 'London',
      state: 'England',
      postal_code: 'SW1A 2AA',
      country: CountryCode.GB,
    },
  },
})

// ============================================================================
// Behavior Definitions
// ============================================================================

/**
 * Create Product with Price Behavior
 *
 * Creates a product and single-payment price for the organization.
 *
 * Postconditions:
 * - Product exists with active status
 * - Price exists with correct amount and currency
 */
const createProductWithPriceBehavior = defineBehavior({
  name: 'create product with price',
  dependencies: [],
  run: async (
    _deps,
    prev: CompleteStripeOnboardingResult
  ): Promise<CreateProductWithPriceResult> => {
    const result = await adminTransaction(async ({ transaction }) => {
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
        transaction
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
          currency: CurrencyCode.USD,
          externalId: null,
          slug: `test-price-${core.nanoid()}`,
        },
        transaction
      )

      return { product, price }
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
 * Creates an anonymous customer and starts a checkout session.
 * The session is Open but does not yet have a billing address.
 *
 * Postconditions:
 * - Customer record exists
 * - Checkout session is Open
 * - Checkout session has no billing address yet
 */
const initiateCheckoutSessionBehavior = defineBehavior({
  name: 'initiate checkout session',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateProductWithPriceResult
  ): Promise<InitiateCheckoutSessionResult> => {
    const result = await adminTransaction(async ({ transaction }) => {
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
 * Provide Billing Address Behavior
 *
 * This is the key behavior that tests MOR vs Platform differentiation.
 * When a billing address is provided:
 * - MOR orgs: Fee calculation is triggered (with tax calculation)
 * - Platform orgs: No fee calculation occurs (null)
 *
 * Postconditions:
 * - Checkout session has billing address set
 * - For MOR: feeCalculation is NOT null and includes tax info
 * - For Platform: feeCalculation IS null
 */
const provideBillingAddressBehavior = defineBehavior({
  name: 'provide billing address',
  dependencies: [CustomerResidencyDep],
  run: async (
    { customerResidencyDep },
    prev: InitiateCheckoutSessionResult
  ): Promise<ProvideBillingAddressResult> => {
    const billingAddress = customerResidencyDep.billingAddress

    const result = await adminTransaction(async ({ transaction }) => {
      const {
        checkoutSession: updatedCheckoutSession,
        feeCalculation,
      } = await editCheckoutSessionBillingAddress(
        {
          checkoutSessionId: prev.checkoutSession.id,
          billingAddress,
        },
        transaction
      )

      return {
        updatedCheckoutSession,
        feeCalculation,
      }
    })

    return {
      ...prev,
      ...result,
      billingAddress,
    }
  },
})

// ============================================================================
// Behavior Test
// ============================================================================

behaviorTest({
  chain: [
    {
      behavior: authenticateUserBehavior,
      invariants: async (result) => {
        expect(result.user.id).toMatch(/^usr_/)
        expect(result.user.email).toContain('@flowglad.com')
      },
    },
    {
      behavior: createOrganizationBehavior,
      invariants: async (result, combination) => {
        const contractTypeDep = ContractTypeDep.get(
          combination.ContractTypeDep
        )

        expect(result.organization.id).toMatch(/^org_/)
        expect(result.organization.stripeConnectContractType).toBe(
          contractTypeDep.contractType
        )
      },
    },
    {
      behavior: completeStripeOnboardingBehavior,
      invariants: async (result) => {
        expect(result.stripeAccountId).toMatch(/^acct_/)
        expect(result.organization.stripeAccountId).toBe(
          result.stripeAccountId
        )
      },
    },
    {
      behavior: createProductWithPriceBehavior,
      invariants: async (result) => {
        // Product was created
        expect(result.product.id).toBeTruthy()
        expect(result.product.active).toBe(true)
        expect(result.product.organizationId).toBe(
          result.organization.id
        )

        // Price was created with correct values
        expect(result.price.id).toBeTruthy()
        expect(result.price.productId).toBe(result.product.id)
        expect(result.price.unitPrice).toBe(5000)
        expect(result.price.type).toBe(PriceType.SinglePayment)
      },
    },
    {
      behavior: initiateCheckoutSessionBehavior,
      invariants: async (result) => {
        // Customer created
        expect(result.customerId).toBeTruthy()

        // Checkout session is open and has no billing address yet
        expect(result.checkoutSession.id).toBeTruthy()
        expect(result.checkoutSession.status).toBe(
          CheckoutSessionStatus.Open
        )
        expect(result.checkoutSession.billingAddress).toBeNull()
        expect(result.checkoutSession.priceId).toBe(result.price.id)
      },
    },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const contractTypeDep = ContractTypeDep.get(
          combination.ContractTypeDep
        )
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )

        // Billing address was set
        expect(result.updatedCheckoutSession.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // **THE KEY INVARIANT**
        // MOR orgs get fee calculation with tax; Platform orgs get null
        if (
          contractTypeDep.contractType ===
          StripeConnectContractType.MerchantOfRecord
        ) {
          // MOR: Fee calculation should exist
          expect(result.feeCalculation).not.toBeNull()
          expect(result.feeCalculation!.checkoutSessionId).toBe(
            result.checkoutSession.id
          )
          expect(result.feeCalculation!.organizationId).toBe(
            result.organization.id
          )
          // MOR includes MoR surcharge percentage
          expect(
            parseFloat(result.feeCalculation!.morSurchargePercentage)
          ).toBeGreaterThan(0)
        } else {
          // Platform: Fee calculation should be null
          expect(result.feeCalculation).toBeNull()
        }
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: async (results) => {
    for (const result of results as ProvideBillingAddressResult[]) {
      try {
        if (result?.organization?.id) {
          await teardownOrg({
            organizationId: result.organization.id,
          })
        }
      } catch (error) {
        console.warn(
          `[teardown] Failed to cleanup org ${result?.organization?.id}:`,
          error
        )
      }
    }
  },
})
