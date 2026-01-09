/**
 * Checkout Behavior Tests
 *
 * This file contains behavior tests for the checkout flow:
 *
 * 1. **Universal Checkout Test** - Tests invariants true for ALL combinations
 * 2. **MoR Checkout Test** - Tests MoR-specific fee calculation behavior
 * 3. **Platform Checkout Test** - Tests Platform-specific (no fee) behavior
 * 4. **MoR Tax-Registered Test** - Tests tax collection for registered jurisdictions
 * 5. **MoR Tax-Unregistered Test** - Tests zero tax for unregistered jurisdictions
 *
 * Chain:
 * 1. Authenticate User
 * 2. Create Organization
 * 3. Complete Stripe Onboarding
 * 4. Create Product with Price
 * 5. Initiate Checkout Session
 * 6. Provide Billing Address
 */

import { expect } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import {
  BusinessOnboardingStatus,
  CheckoutSessionStatus,
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
  PriceType,
  StripeConnectContractType,
} from '@/types'
import { teardownOrg } from '../../../../seedDatabase'
import { authenticateUserBehavior } from '../behaviors/authBehaviors'
import {
  applyDiscountBehavior,
  createProductWithPriceBehavior,
  initiateCheckoutSessionBehavior,
  type ProvideBillingAddressResult,
  provideBillingAddressBehavior,
} from '../behaviors/checkoutBehaviors'
import { createOrganizationBehavior } from '../behaviors/orgSetupBehaviors'
import { completeStripeOnboardingBehavior } from '../behaviors/stripeOnboardingBehaviors'
import { ContractTypeDep } from '../dependencies/contractTypeDependencies'
import { CountryDep } from '../dependencies/countryDependencies'
import { CustomerResidencyDep } from '../dependencies/customerResidencyDependencies'
import { DiscountDep } from '../dependencies/discountDependencies'
import { behaviorTest } from '../index'

// =============================================================================
// Shared teardown function
// =============================================================================

const checkoutTeardown = async (results: unknown[]) => {
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
}

// =============================================================================
// Universal Checkout Behavior Test (all combinations)
// =============================================================================

behaviorTest({
  chain: [
    {
      behavior: authenticateUserBehavior,
      invariants: async (result) => {
        // User ID format
        expect(result.user.id).toMatch(/^usr_/)
        // User has valid email
        expect(result.user.email).toContain('@flowglad.com')
      },
    },
    {
      behavior: createOrganizationBehavior,
      invariants: async (result, combination) => {
        const countryDep = CountryDep.get(combination.CountryDep)
        const contractTypeDep = ContractTypeDep.get(
          combination.ContractTypeDep
        )

        // Organization ID format and name
        expect(result.organization.id).toMatch(/^org_/)
        expect(result.organization.name).toContain('Test Org')

        // Organization linked to correct country
        expect(result.organization.countryId).toBe(result.country.id)
        expect(result.country.code).toBe(countryDep.countryCode)

        // Contract type correctly set
        expect(result.organization.stripeConnectContractType).toBe(
          contractTypeDep.contractType
        )

        // Currency: MoR always USD, Platform uses country's currency
        if (
          contractTypeDep.contractType ===
          StripeConnectContractType.MerchantOfRecord
        ) {
          expect(result.organization.defaultCurrency).toBe(
            CurrencyCode.USD
          )
        } else {
          expect(result.organization.defaultCurrency).toBe(
            countryDep.expectedCurrency
          )
        }

        // Organization fee percentage has expected default value
        expect(result.organization.feePercentage).toBe('0.65')

        // Organization starts without Stripe connection
        expect(result.organization.stripeAccountId).toBeNull()
        expect(result.organization.onboardingStatus).toBe(
          BusinessOnboardingStatus.Unauthorized
        )
        expect(result.organization.payoutsEnabled).toBe(false)

        // Membership links user to organization
        expect(result.membership.userId).toBe(result.user.id)
        expect(result.membership.organizationId).toBe(
          result.organization.id
        )
        expect(result.membership.focused).toBe(true)

        // Verify pricing model exists with isDefault: true
        const pricingModels = await adminTransaction(
          async ({ transaction }) => {
            return selectPricingModels(
              {
                organizationId: result.organization.id,
                livemode: true,
              },
              transaction
            )
          }
        )
        const defaultPricingModel = pricingModels.find(
          (pm) => pm.isDefault
        )
        expect(defaultPricingModel).toBeDefined()
        expect(defaultPricingModel!.isDefault).toBe(true)
        expect(defaultPricingModel!.organizationId).toBe(
          result.organization.id
        )
      },
    },
    {
      behavior: completeStripeOnboardingBehavior,
      invariants: async (result) => {
        // Stripe account ID format and linkage
        expect(result.stripeAccountId).toMatch(/^acct_test_/)
        expect(result.stripeAccountId.length).toBeGreaterThan(10)
        expect(result.organization.stripeAccountId).toBe(
          result.stripeAccountId
        )

        // Onboarding status updated to FullyOnboarded
        expect(result.organization.onboardingStatus).toBe(
          BusinessOnboardingStatus.FullyOnboarded
        )

        // payoutsEnabled remains false until manual approval
        expect(result.organization.payoutsEnabled).toBe(false)
      },
    },
    {
      behavior: createProductWithPriceBehavior,
      invariants: async (result) => {
        // Product assertions
        expect(result.product.id).toMatch(/^prod_/)
        expect(result.product.active).toBe(true)
        expect(result.product.livemode).toBe(true)
        expect(result.product.organizationId).toBe(
          result.organization.id
        )
        expect(result.product.name).toContain('Test Product')

        // Price assertions
        expect(result.price.id).toMatch(/^price_/)
        expect(result.price.productId).toBe(result.product.id)
        expect(result.price.unitPrice).toBe(5000) // Exact value: $50.00
        expect(result.price.type).toBe(PriceType.SinglePayment)
        expect(result.price.currency).toBe(CurrencyCode.USD)
        expect(result.price.active).toBe(true)
        expect(result.price.livemode).toBe(true)
      },
    },
    {
      behavior: initiateCheckoutSessionBehavior,
      invariants: async (result) => {
        // Customer assertions
        expect(result.customerId).toMatch(/^cust_/)

        // Checkout session ID format and linkages
        expect(result.checkoutSession.id).toMatch(/^chckt_session_/)
        expect(result.checkoutSession.organizationId).toBe(
          result.organization.id
        )
        expect(result.checkoutSession.customerId).toBe(
          result.customerId
        )
        expect(result.checkoutSession.priceId).toBe(result.price.id)
        expect(result.checkoutSession.livemode).toBe(true)

        // Session starts open with no billing address
        expect(result.checkoutSession.status).toBe(
          CheckoutSessionStatus.Open
        )
        expect(result.checkoutSession.billingAddress).toBeNull()

        // Quantity and payment method defaults
        expect(result.checkoutSession.quantity).toBe(1)
        expect(result.checkoutSession.paymentMethodType).toBe(
          PaymentMethodType.Card
        )

        // Invoice not yet created (no billing address yet)
        expect(result.checkoutSession.invoiceId).toBeNull()
      },
    },
    {
      behavior: applyDiscountBehavior,
      invariants: async (result, combination) => {
        const discountDep = DiscountDep.get(combination.DiscountDep)

        // Discount linked if provided
        if (discountDep.discountInsert) {
          expect(result.discount).not.toBeNull()
          expect(result.checkoutSessionWithDiscount.discountId).toBe(
            result.discount!.id
          )
        } else {
          expect(result.discount).toBeNull()
          expect(
            result.checkoutSessionWithDiscount.discountId
          ).toBeNull()
        }
      },
    },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )

        // Billing address correctly saved with exact match
        expect(result.updatedCheckoutSession.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // Checkout session remains open
        expect(result.updatedCheckoutSession.status).toBe(
          CheckoutSessionStatus.Open
        )
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// MoR Checkout Behavior Test (filtered to merchantOfRecord only)
// =============================================================================

behaviorTest({
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )
        const discountDep = DiscountDep.get(combination.DiscountDep)

        // MoR invariant: Fee calculation must exist
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Fee calculation linked to correct entities
        expect(fc.checkoutSessionId).toBe(
          result.checkoutSessionWithDiscount.id
        )
        expect(fc.organizationId).toBe(result.organization.id)
        expect(fc.type).toBe(
          FeeCalculationType.CheckoutSessionPayment
        )

        // Base amount matches price exactly
        expect(fc.baseAmount).toBe(result.price.unitPrice)

        // Discount amount matches expected calculation
        const expectedDiscount = discountDep.expectedDiscountAmount(
          result.price.unitPrice
        )
        expect(fc.discountAmountFixed).toBe(expectedDiscount)
        expect(fc.baseAmount).toBe(5000) // Explicit check: $50.00

        // Currency matches USD
        expect(fc.currency).toBe(CurrencyCode.USD)

        // Flowglad fee percentage matches organization default
        expect(fc.flowgladFeePercentage).toBe(
          result.organization.feePercentage
        )
        expect(fc.flowgladFeePercentage).toBe('0.65')

        // MoR surcharge percentage (MOR_SURCHARGE_PERCENTAGE = 1.1 from fees/common.ts)
        expect(fc.morSurchargePercentage).toBe('1.1')

        // International fee percentage exists
        expect(fc.internationalFeePercentage).toBeTruthy()

        // Payment method type matches checkout session
        expect(fc.paymentMethodType).toBe(PaymentMethodType.Card)

        // Payment method fee: Card = 2.9% of pretaxTotal + 30¢ (fees/common.ts)
        // When pretaxTotal is 0 (100% discount), no payment method fee is charged
        if (fc.pretaxTotal > 0) {
          const expectedPaymentMethodFee =
            Math.round(fc.pretaxTotal * 0.029) + 30
          expect(fc.paymentMethodFeeFixed).toBe(
            expectedPaymentMethodFee
          )
        } else {
          expect(fc.paymentMethodFeeFixed).toBe(0)
        }

        // Discount ID linked correctly when discount applied
        if (discountDep.discountInsert) {
          expect(fc.discountId).toBe(result.discount!.id)
        } else {
          expect(fc.discountId).toBeNull()
        }

        // Pretax total = baseAmount - discountAmountFixed
        expect(fc.pretaxTotal).toBe(
          fc.baseAmount - fc.discountAmountFixed
        )

        // Tax calculation ID should exist
        expect(fc.stripeTaxCalculationId).toBeTruthy()
        expect(fc.stripeTaxCalculationId).toMatch(
          /^(taxcalc_|testtaxcalc_|notaxoverride_)/
        )

        // Tax amount is >= 0 (varies by jurisdiction)
        expect(fc.taxAmountFixed).toBeGreaterThanOrEqual(0)

        // Billing address stored in fee calculation matches input exactly
        expect(fc.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )
      },
    },
  ],
  only: [{ ContractTypeDep: 'merchantOfRecord' }],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// Platform Checkout Behavior Test (filtered to platform only)
// =============================================================================

behaviorTest({
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )

        // Platform invariant: No fee calculation (no Flowglad tax handling)
        expect(result.feeCalculation).toBeNull()

        // Billing address still saved on checkout session exactly as provided
        expect(result.updatedCheckoutSession.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // Checkout session remains open
        expect(result.updatedCheckoutSession.status).toBe(
          CheckoutSessionStatus.Open
        )
      },
    },
  ],
  only: [{ ContractTypeDep: 'platform' }],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// MoR + VAT Jurisdiction Test (UK, Germany)
// Tests MoR behavior for VAT-registered jurisdictions where tax is collected
// =============================================================================

behaviorTest({
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )
        const discountDep = DiscountDep.get(combination.DiscountDep)

        // Fee calculation must exist for MoR
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Base amount matches the price
        expect(fc.baseAmount).toBe(5000)

        // Discount amount matches expected calculation
        const expectedDiscount =
          discountDep.expectedDiscountAmount(5000)
        expect(fc.discountAmountFixed).toBe(expectedDiscount)

        // Pretax total = baseAmount - discountAmountFixed
        expect(fc.pretaxTotal).toBe(
          fc.baseAmount - fc.discountAmountFixed
        )

        // VAT jurisdiction configuration
        expect(customerResidencyDep.expectedTaxRate).toBeGreaterThan(
          0
        )
        expect(customerResidencyDep.isFlowgladRegistered).toBe(true)

        // Tax calculation ID is set for registered jurisdictions
        expect(fc.stripeTaxCalculationId).toBeTruthy()
        expect(fc.stripeTaxCalculationId).toMatch(
          /^(taxcalc_|testtaxcalc_|notaxoverride_)/
        )

        // Billing address matches the VAT jurisdiction exactly
        expect(fc.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // Fee percentages are set correctly
        expect(fc.flowgladFeePercentage).toBe('0.65')
        expect(fc.morSurchargePercentage).toBe('1.1')

        // Payment method fee: Card = 2.9% of pretaxTotal + 30¢
        // When pretaxTotal is 0 (100% discount), no payment method fee is charged
        if (fc.pretaxTotal > 0) {
          const expectedPaymentMethodFee =
            Math.round(fc.pretaxTotal * 0.029) + 30
          expect(fc.paymentMethodFeeFixed).toBe(
            expectedPaymentMethodFee
          )
        } else {
          expect(fc.paymentMethodFeeFixed).toBe(0)
        }

        // International fee applies for non-US customers
        expect(fc.internationalFeePercentage).toBeTruthy()
      },
    },
  ],
  only: [
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'uk-london',
    },
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'de-berlin',
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// MoR + US Sales Tax Jurisdiction Test (NYC - registered)
// Tests MoR behavior for US sales tax registered jurisdictions
// =============================================================================

behaviorTest({
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )
        const discountDep = DiscountDep.get(combination.DiscountDep)

        // Fee calculation must exist for MoR
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Base amount matches the price
        expect(fc.baseAmount).toBe(5000)

        // Discount amount matches expected calculation
        const expectedDiscount =
          discountDep.expectedDiscountAmount(5000)
        expect(fc.discountAmountFixed).toBe(expectedDiscount)

        // Pretax total = baseAmount - discountAmountFixed
        expect(fc.pretaxTotal).toBe(
          fc.baseAmount - fc.discountAmountFixed
        )

        // NYC is a registered jurisdiction with specific rate
        expect(customerResidencyDep.isFlowgladRegistered).toBe(true)
        expect(customerResidencyDep.expectedTaxRate).toBe(0.08875) // NY + NYC + MTA

        // Tax calculation ID must exist
        expect(fc.stripeTaxCalculationId).toBeTruthy()
        expect(fc.stripeTaxCalculationId).toMatch(
          /^(taxcalc_|testtaxcalc_|notaxoverride_)/
        )

        // Billing address matches NYC exactly
        expect(fc.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // Fee percentages are set correctly
        expect(fc.flowgladFeePercentage).toBe('0.65')
        expect(fc.morSurchargePercentage).toBe('1.1')

        // Payment method fee: Card = 2.9% of pretaxTotal + 30¢
        // When pretaxTotal is 0 (100% discount), no payment method fee is charged
        if (fc.pretaxTotal > 0) {
          const expectedPaymentMethodFee =
            Math.round(fc.pretaxTotal * 0.029) + 30
          expect(fc.paymentMethodFeeFixed).toBe(
            expectedPaymentMethodFee
          )
        } else {
          expect(fc.paymentMethodFeeFixed).toBe(0)
        }

        // US address has no international fee
        expect(fc.internationalFeePercentage).toBe('0')
      },
    },
  ],
  only: [
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'us-nyc',
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// MoR + No-Tax Jurisdiction Test (Oregon, Texas unregistered)
// Tests MoR behavior for jurisdictions where no tax is collected
// =============================================================================

behaviorTest({
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: createProductWithPriceBehavior },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )
        const discountDep = DiscountDep.get(combination.DiscountDep)

        // Fee calculation must exist for MoR
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Base amount matches the price
        expect(fc.baseAmount).toBe(5000)

        // Discount amount matches expected calculation
        const expectedDiscount =
          discountDep.expectedDiscountAmount(5000)
        expect(fc.discountAmountFixed).toBe(expectedDiscount)

        // Pretax total = baseAmount - discountAmountFixed
        expect(fc.pretaxTotal).toBe(
          fc.baseAmount - fc.discountAmountFixed
        )

        // These are unregistered/no-tax jurisdictions
        expect(customerResidencyDep.expectedTaxRate).toBe(0)
        expect(customerResidencyDep.isFlowgladRegistered).toBe(false)

        // Tax calculation ID still exists (even for notaxoverride)
        expect(fc.stripeTaxCalculationId).toBeTruthy()
        expect(fc.stripeTaxCalculationId).toMatch(
          /^(taxcalc_|testtaxcalc_|notaxoverride_)/
        )

        // Billing address matches exactly
        expect(fc.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // Fee percentages are set correctly
        expect(fc.flowgladFeePercentage).toBe('0.65')
        expect(fc.morSurchargePercentage).toBe('1.1')

        // Payment method fee: Card = 2.9% of pretaxTotal + 30¢
        // When pretaxTotal is 0 (100% discount), no payment method fee is charged
        if (fc.pretaxTotal > 0) {
          const expectedPaymentMethodFee =
            Math.round(fc.pretaxTotal * 0.029) + 30
          expect(fc.paymentMethodFeeFixed).toBe(
            expectedPaymentMethodFee
          )
        } else {
          expect(fc.paymentMethodFeeFixed).toBe(0)
        }

        // US address has no international fee
        expect(fc.internationalFeePercentage).toBe('0')

        // Tax amount should be 0 for unregistered jurisdictions
        // (This is the key assertion for no-tax jurisdictions)
        expect(fc.taxAmountFixed).toBe(0)
      },
    },
  ],
  only: [
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'us-oregon',
    },
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'us-texas-unregistered',
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})
