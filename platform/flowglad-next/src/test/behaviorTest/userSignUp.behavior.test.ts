/**
 * User Sign-Up Behavior Test
 *
 * Tests the complete user sign-up flow across different country and
 * contract type configurations. The chain progresses through:
 *
 * 1. Authenticate User - Creates a user with no organization memberships
 * 2. Create Organization - Sets up org, membership, pricing models, products
 * 3. Initiate Stripe Connect - Links Stripe account, sets PartiallyOnboarded
 * 4. Finalize Stripe Onboarding - Marks organization as FullyOnboarded
 */

import { expect } from 'vitest'
import { teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import {
  BusinessOnboardingStatus,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'
import {
  type AuthenticateUserResult,
  authenticateUserBehavior,
} from './behaviors/authBehaviors'
import {
  type CreateOrganizationResult,
  createOrganizationBehavior,
} from './behaviors/orgSetupBehaviors'
import {
  type CompleteStripeOnboardingResult,
  finalizeStripeOnboardingBehavior,
  type InitiateStripeConnectResult,
  initiateStripeConnectBehavior,
} from './behaviors/stripeOnboardingBehaviors'
import { ContractTypeDep } from './dependencies/contractTypeDependencies'
import { CountryDep } from './dependencies/countryDependencies'
import { behaviorTest } from './index'

// =============================================================================
// Behavior Test
// =============================================================================

behaviorTest({
  chain: [
    {
      behavior: authenticateUserBehavior,
      invariants: async (result: AuthenticateUserResult) => {
        // User record exists with valid format
        expect(result.user.id).toMatch(/^usr_/)
        expect(result.user.betterAuthId).toMatch(/^ba_/)
        expect(result.user.email).toContain('@flowglad.com')

        // User has no memberships yet
        const memberships = await adminTransaction(
          async ({ transaction }) => {
            return selectMemberships(
              { userId: result.user.id },
              transaction
            )
          }
        )
        expect(memberships).toHaveLength(0)
      },
    },
    {
      behavior: createOrganizationBehavior,
      invariants: async (
        result: CreateOrganizationResult,
        combination
      ) => {
        // Organization exists with correct format
        expect(result.organization.id).toMatch(/^org_/)
        expect(result.organization.name).toBeTruthy()

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
        const pricingModels = await adminTransaction(
          async ({ transaction }) => {
            return selectPricingModels(
              { organizationId: result.organization.id },
              transaction
            )
          }
        )
        expect(pricingModels).toHaveLength(2)
        const livemodeModels = pricingModels.filter(
          (pm) => pm.livemode
        )
        const testmodeModels = pricingModels.filter(
          (pm) => !pm.livemode
        )
        expect(livemodeModels).toHaveLength(1)
        expect(testmodeModels).toHaveLength(1)

        // Verify default products exist
        const products = await adminTransaction(
          async ({ transaction }) => {
            return selectProducts(
              { organizationId: result.organization.id },
              transaction
            )
          }
        )
        // Should have at least 2 products (one per mode)
        expect(products.length).toBeGreaterThanOrEqual(2)

        // Currency matches country expectation (for Platform contract type)
        // MoR always uses USD
        const countryDep = CountryDep.get(combination.CountryDep)
        const contractTypeDep = ContractTypeDep.get(
          combination.ContractTypeDep
        )

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
      },
    },
    {
      behavior: initiateStripeConnectBehavior,
      invariants: async (result: InitiateStripeConnectResult) => {
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
      },
    },
    {
      behavior: finalizeStripeOnboardingBehavior,
      invariants: async (result: CompleteStripeOnboardingResult) => {
        // Status updated to FullyOnboarded
        expect(result.organization.onboardingStatus).toBe(
          BusinessOnboardingStatus.FullyOnboarded
        )

        // Payouts still disabled (requires manual approval)
        expect(result.organization.payoutsEnabled).toBe(false)

        // Stripe account unchanged
        expect(result.organization.stripeAccountId).toMatch(/^acct_/)
      },
    },
  ],
  testOptions: { timeout: 60000 },
  teardown: async (results) => {
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
  },
})
