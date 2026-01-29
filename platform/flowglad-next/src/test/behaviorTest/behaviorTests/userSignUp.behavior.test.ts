/**
 * User Sign-Up Behavior Tests
 *
 * Tests the complete user sign-up flow across different country and
 * contract type configurations.
 *
 * ## Design Principles
 *
 * 1. **No conditional assertions** - Use filtered behavior tests instead of `if` checks
 * 2. **Contract-type-specific tests** - MoR and Platform have different currency behavior
 *
 * ## Test Structure
 *
 * 1. **MoR Sign-Up** - Currency is always USD regardless of country
 * 2. **Platform Sign-Up** - Currency matches the organization's country
 */

import { expect } from 'bun:test'
import { Result } from 'better-result'
import { teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import {
  type AuthenticateUserResult,
  authenticateUserBehavior,
} from '@/test/behaviorTest/behaviors/authBehaviors'
import {
  type CreateOrganizationResult,
  createOrganizationBehavior,
} from '@/test/behaviorTest/behaviors/orgSetupBehaviors'
import {
  type CompleteStripeOnboardingResult,
  finalizeStripeOnboardingBehavior,
  type InitiateStripeConnectResult,
  initiateStripeConnectBehavior,
} from '@/test/behaviorTest/behaviors/stripeOnboardingBehaviors'
import { CountryDep } from '@/test/behaviorTest/dependencies/countryDependencies'
import { behaviorTest } from '@/test/behaviorTest/index'
import {
  BusinessOnboardingStatus,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'

// =============================================================================
// Shared teardown function
// =============================================================================

const signUpTeardown = async (results: unknown[]) => {
  for (const result of results as CompleteStripeOnboardingResult[]) {
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
// Shared invariant helpers
// =============================================================================

/**
 * Common invariants for organization creation that apply to both MoR and Platform.
 */
const commonOrgInvariants = async (
  result: CreateOrganizationResult
) => {
  // Organization exists with correct format
  expect(result.organization.id).toMatch(/^org_/)
  expect(typeof result.organization.name).toBe('string')
  expect(result.organization.name.length).toBeGreaterThan(0)

  // Organization has correct initial status
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

  // Verify pricing models exist (livemode + testmode)
  const pricingModels = (
    await adminTransaction(async ({ transaction }) => {
      return Result.ok(
        await selectPricingModels(
          { organizationId: result.organization.id },
          transaction
        )
      )
    })
  ).unwrap()
  expect(pricingModels).toHaveLength(2)
  const livemodeModels = pricingModels.filter((pm) => pm.livemode)
  const testmodeModels = pricingModels.filter((pm) => !pm.livemode)
  expect(livemodeModels).toHaveLength(1)
  expect(testmodeModels).toHaveLength(1)

  // Verify default products exist
  const products = (
    await adminTransaction(async ({ transaction }) => {
      return Result.ok(
        await selectProducts(
          { organizationId: result.organization.id },
          transaction
        )
      )
    })
  ).unwrap()
  // Should have at least 2 products (one per mode)
  expect(products.length).toBeGreaterThanOrEqual(2)
}

/**
 * Common invariants for user authentication.
 */
const authInvariants = async (result: AuthenticateUserResult) => {
  // User record exists with valid format
  expect(result.user.id).toMatch(/^usr_/)
  expect(result.user.betterAuthId).toMatch(/^ba_/)
  expect(result.user.email).toContain('@flowglad.com')

  // User has no memberships yet
  const memberships = (
    await adminTransaction(async ({ transaction }) => {
      return Result.ok(
        await selectMemberships(
          { userId: result.user.id },
          transaction
        )
      )
    })
  ).unwrap()
  expect(memberships).toHaveLength(0)
}

/**
 * Common invariants for Stripe Connect initiation.
 */
const stripeConnectInvariants = async (
  result: InitiateStripeConnectResult
) => {
  // Stripe account is linked
  expect(result.stripeAccountId).toMatch(/^acct_/)
  expect(result.organization.stripeAccountId).toBe(
    result.stripeAccountId
  )

  // Status updated to PartiallyOnboarded
  expect(result.organization.onboardingStatus).toBe(
    BusinessOnboardingStatus.PartiallyOnboarded
  )

  // Payouts still disabled
  expect(result.organization.payoutsEnabled).toBe(false)
}

/**
 * Common invariants for Stripe onboarding finalization.
 */
const stripeOnboardingFinalInvariants = async (
  result: CompleteStripeOnboardingResult
) => {
  // Status updated to FullyOnboarded
  expect(result.organization.onboardingStatus).toBe(
    BusinessOnboardingStatus.FullyOnboarded
  )

  // Payouts still disabled (requires manual approval)
  expect(result.organization.payoutsEnabled).toBe(false)

  // Stripe account unchanged
  expect(result.organization.stripeAccountId).toMatch(/^acct_/)
}

// =============================================================================
// MoR Sign-Up Behavior Test
//
// Tests user sign-up for Merchant of Record organizations.
// Key invariant: Currency is always USD regardless of country.
// =============================================================================

behaviorTest({
  only: [{ ContractTypeDep: 'merchantOfRecord' }],
  chain: [
    {
      behavior: authenticateUserBehavior,
      invariants: authInvariants,
    },
    {
      behavior: createOrganizationBehavior,
      invariants: async (result: CreateOrganizationResult) => {
        await commonOrgInvariants(result)

        // MoR organizations are always USD regardless of country
        expect(result.organization.defaultCurrency).toBe(
          CurrencyCode.USD
        )
        expect(result.organization.stripeConnectContractType).toBe(
          StripeConnectContractType.MerchantOfRecord
        )
      },
    },
    {
      behavior: initiateStripeConnectBehavior,
      invariants: stripeConnectInvariants,
    },
    {
      behavior: finalizeStripeOnboardingBehavior,
      invariants: stripeOnboardingFinalInvariants,
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: signUpTeardown,
})

// =============================================================================
// Platform Sign-Up Behavior Test
//
// Tests user sign-up for Platform organizations.
// Key invariant: Currency matches the organization's country.
// =============================================================================

behaviorTest({
  only: [{ ContractTypeDep: 'platform' }],
  chain: [
    {
      behavior: authenticateUserBehavior,
      invariants: authInvariants,
    },
    {
      behavior: createOrganizationBehavior,
      invariants: async (
        result: CreateOrganizationResult,
        getDep
      ) => {
        await commonOrgInvariants(result)

        const countryDep = getDep(CountryDep)

        // Platform organizations use their country's currency
        expect(result.organization.defaultCurrency).toBe(
          countryDep.expectedCurrency
        )
        expect(result.organization.stripeConnectContractType).toBe(
          StripeConnectContractType.Platform
        )
      },
    },
    {
      behavior: initiateStripeConnectBehavior,
      invariants: stripeConnectInvariants,
    },
    {
      behavior: finalizeStripeOnboardingBehavior,
      invariants: stripeOnboardingFinalInvariants,
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: signUpTeardown,
})
