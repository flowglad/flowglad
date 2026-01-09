/**
 * Checkout Behavior Tests
 *
 * Tests the checkout flow across different contract types (MoR vs Platform),
 * focusing on the key behavioral difference: MoR orgs get fee/tax calculations,
 * Platform orgs do not.
 *
 * ## Design Principles
 *
 * 1. **No conditional assertions** - Use filtered behavior tests instead of `if` checks
 * 2. **Flow-level invariants** - Test state transitions, not implementation details
 * 3. **Step-level filtering** - Assert invariants at each step where they apply
 *
 * ## Test Structure
 *
 * 1. **MoR Checkout** - Fee calculation exists, currency is USD, tax is calculated
 * 2. **Platform Checkout** - No fee calculation, currency matches org country
 * 3. **MoR Tax Jurisdictions** - Tax behavior varies by customer location
 */

import { expect } from 'vitest'
import {
  CheckoutSessionStatus,
  CurrencyCode,
  FeeCalculationType,
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
// MoR Checkout Behavior Test
//
// Tests the checkout flow for Merchant of Record organizations.
// Key invariants:
// - Organization currency is always USD
// - Fee calculation is created when billing address is provided
// - Tax calculation is performed
// =============================================================================

behaviorTest({
  only: [{ ContractTypeDep: 'merchantOfRecord' }],
  chain: [
    { behavior: authenticateUserBehavior },
    {
      behavior: createOrganizationBehavior,
      invariants: async (result) => {
        // MoR organizations are always USD
        expect(result.organization.defaultCurrency).toBe(
          CurrencyCode.USD
        )
        expect(result.organization.stripeConnectContractType).toBe(
          StripeConnectContractType.MerchantOfRecord
        )
      },
    },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: createProductWithPriceBehavior,
      invariants: async (result) => {
        // MoR prices are always in USD
        expect(result.price.currency).toBe(CurrencyCode.USD)
        expect(result.price.type).toBe(PriceType.SinglePayment)
      },
    },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )
        const discountDep = DiscountDep.get(combination.DiscountDep)

        // Billing address saved on checkout session
        expect(result.updatedCheckoutSession.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )
        expect(result.updatedCheckoutSession.status).toBe(
          CheckoutSessionStatus.Open
        )

        // MoR: Fee calculation MUST exist after billing address is provided
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Fee calculation is linked to the checkout session
        expect(fc.checkoutSessionId).toBe(
          result.checkoutSessionWithDiscount.id
        )
        expect(fc.type).toBe(
          FeeCalculationType.CheckoutSessionPayment
        )
        expect(fc.currency).toBe(CurrencyCode.USD)

        // Tax calculation was performed
        expect(fc.stripeTaxCalculationId).toBeTruthy()

        // Discount applied correctly
        const expectedDiscount = discountDep.expectedDiscountAmount(
          result.price.unitPrice
        )
        expect(fc.discountAmountFixed).toBe(expectedDiscount)
        expect(fc.pretaxTotal).toBe(
          fc.baseAmount - fc.discountAmountFixed
        )
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// Platform Checkout Behavior Test
//
// Tests the checkout flow for Platform organizations.
// Key invariants:
// - Organization currency matches their country's currency
// - NO fee calculation is created (organization handles tax)
// =============================================================================

behaviorTest({
  only: [{ ContractTypeDep: 'platform' }],
  chain: [
    { behavior: authenticateUserBehavior },
    {
      behavior: createOrganizationBehavior,
      invariants: async (result, combination) => {
        const countryDep = CountryDep.get(combination.CountryDep)

        // Platform organizations use their country's currency
        expect(result.organization.defaultCurrency).toBe(
          countryDep.expectedCurrency
        )
        expect(result.organization.stripeConnectContractType).toBe(
          StripeConnectContractType.Platform
        )
      },
    },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: createProductWithPriceBehavior,
      invariants: async (result, combination) => {
        const countryDep = CountryDep.get(combination.CountryDep)

        // Platform prices use the organization's currency
        expect(result.price.currency).toBe(
          countryDep.expectedCurrency
        )
        expect(result.price.type).toBe(PriceType.SinglePayment)
      },
    },
    { behavior: initiateCheckoutSessionBehavior },
    { behavior: applyDiscountBehavior },
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result, combination) => {
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )

        // Billing address saved on checkout session
        expect(result.updatedCheckoutSession.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )
        expect(result.updatedCheckoutSession.status).toBe(
          CheckoutSessionStatus.Open
        )

        // Platform: NO fee calculation (organization handles tax compliance)
        expect(result.feeCalculation).toBeNull()
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// MoR + Tax-Registered Jurisdiction Test (VAT and US Sales Tax)
//
// Tests MoR behavior for jurisdictions where Flowglad is registered to collect tax.
// Key invariants:
// - Tax calculation is performed
// - Tax amount is greater than zero (when there's a pretax amount)
//
// Note: Skips 100% discount case since zero pretax = zero tax.
// =============================================================================

behaviorTest({
  only: [
    // VAT jurisdictions
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'uk-london',
    },
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'de-berlin',
    },
    // US sales tax registered
    {
      ContractTypeDep: 'merchantOfRecord',
      CustomerResidencyDep: 'us-nyc',
    },
  ],
  skip: [{ DiscountDep: 'percent-100' }], // Zero pretax = zero tax
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

        // Fee calculation exists for MoR
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Tax-registered jurisdiction: Flowglad is registered here
        expect(customerResidencyDep.isFlowgladRegistered).toBe(true)
        expect(customerResidencyDep.expectedTaxRate).toBeGreaterThan(
          0
        )

        // Tax calculation was performed
        expect(fc.stripeTaxCalculationId).toBeTruthy()

        // Tax amount is greater than zero for registered jurisdictions with pretax amount
        expect(fc.pretaxTotal).toBeGreaterThan(0)
        expect(fc.taxAmountFixed).toBeGreaterThan(0)

        // Billing address matches the customer's location
        expect(fc.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})

// =============================================================================
// MoR + Tax-Unregistered Jurisdiction Test (Oregon, Texas)
//
// Tests MoR behavior for jurisdictions where Flowglad is NOT registered.
// Key invariant: Tax calculation is performed but tax amount is zero.
// =============================================================================

behaviorTest({
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

        // Fee calculation exists for MoR
        expect(result.feeCalculation).not.toBeNull()
        const fc = result.feeCalculation!

        // Tax-unregistered jurisdiction: Flowglad is NOT registered here
        expect(customerResidencyDep.isFlowgladRegistered).toBe(false)
        expect(customerResidencyDep.expectedTaxRate).toBe(0)

        // Tax calculation was still performed (returns zero)
        expect(fc.stripeTaxCalculationId).toBeTruthy()

        // Tax amount is zero for unregistered jurisdictions
        expect(fc.taxAmountFixed).toBe(0)

        // Billing address matches the customer's location
        expect(fc.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})
