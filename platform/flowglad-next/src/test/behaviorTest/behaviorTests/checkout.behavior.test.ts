/**
 * Checkout Behavior Tests
 *
 * This file contains three behavior tests:
 *
 * 1. **Universal Checkout Test** - Tests invariants true for ALL combinations
 * 2. **MoR Checkout Test** - Tests MoR-specific fee calculation behavior
 * 3. **Platform Checkout Test** - Tests Platform-specific (no fee) behavior
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
import { CheckoutSessionStatus, PriceType } from '@/types'
import { teardownOrg } from '../../../../seedDatabase'
import { authenticateUserBehavior } from '../behaviors/authBehaviors'
import {
  createProductWithPriceBehavior,
  initiateCheckoutSessionBehavior,
  type ProvideBillingAddressResult,
  provideBillingAddressBehavior,
} from '../behaviors/checkoutBehaviors'
import { createOrganizationBehavior } from '../behaviors/orgSetupBehaviors'
import { completeStripeOnboardingBehavior } from '../behaviors/stripeOnboardingBehaviors'
import { CustomerResidencyDep } from '../dependencies/customerResidencyDependencies'
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
        expect(result.user.id).toMatch(/^usr_/)
        expect(result.user.email).toContain('@flowglad.com')
      },
    },
    {
      behavior: createOrganizationBehavior,
      invariants: async (result) => {
        // Universal invariant: Organization is created with valid ID
        expect(result.organization.id).toMatch(/^org_/)
        expect(result.organization.name).toBeTruthy()
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
        const customerResidencyDep = CustomerResidencyDep.get(
          combination.CustomerResidencyDep
        )

        // Universal invariant: Billing address is correctly saved
        expect(result.updatedCheckoutSession.billingAddress).toEqual(
          customerResidencyDep.billingAddress
        )

        // Universal invariant: Checkout session remains open
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
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result) => {
        // MoR invariant: Fee calculation is created
        expect(result.feeCalculation).not.toBeNull()
        expect(result.feeCalculation!.checkoutSessionId).toBe(
          result.checkoutSession.id
        )
        expect(result.feeCalculation!.organizationId).toBe(
          result.organization.id
        )
        // MoR includes MoR surcharge percentage
        expect(
          parseFloat(result.feeCalculation!.morSurchargePercentage)
        ).toBeGreaterThan(0)
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
    {
      behavior: provideBillingAddressBehavior,
      invariants: async (result) => {
        // Platform invariant: No fee calculation
        expect(result.feeCalculation).toBeNull()
      },
    },
  ],
  only: [{ ContractTypeDep: 'platform' }],
  testOptions: { timeout: 60000 },
  teardown: checkoutTeardown,
})
