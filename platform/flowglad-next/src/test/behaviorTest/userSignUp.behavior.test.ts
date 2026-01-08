/**
 * User Sign-Up Behavior Test
 *
 * Tests the complete user sign-up flow across different country and
 * contract type configurations. The chain progresses through:
 *
 * 1. Authenticate User - Creates a user with no organization memberships
 * 2. Create Organization - Sets up org, membership, pricing models, products
 * 3. Initiate Stripe Connect - Links Stripe account, sets PartiallyOnboarded
 * 4. Complete Stripe Onboarding - Marks organization as FullyOnboarded
 */

import { expect } from 'vitest'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Country } from '@/db/schema/countries'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import {
  BusinessOnboardingStatus,
  CountryCode,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { behaviorTest, Dependency, defineBehavior } from './index'

// ============================================================================
// Result Types
// ============================================================================

interface AuthenticateUserResult {
  user: User.Record
}

interface CreateOrganizationResult extends AuthenticateUserResult {
  organization: Organization.Record
  membership: Membership.Record
  country: Country.Record
}

interface InitiateStripeConnectResult
  extends CreateOrganizationResult {
  stripeAccountId: string
}

interface CompleteStripeOnboardingResult
  extends InitiateStripeConnectResult {}

// ============================================================================
// Dependency Definitions
// ============================================================================

/**
 * CountryDep - Defines which country the organization is based in.
 * Different countries have different currency defaults and payment eligibility.
 */
interface CountryConfig {
  countryCode: CountryCode
  expectedCurrency: CurrencyCode
}

abstract class CountryDep extends Dependency<CountryConfig>() {
  abstract countryCode: CountryCode
  abstract expectedCurrency: CurrencyCode
}

/**
 * ContractTypeDep - Defines the Stripe Connect contract type.
 * Platform vs Merchant-of-Record affects fee structures and payment flows.
 */
interface ContractTypeConfig {
  contractType: StripeConnectContractType
}

abstract class ContractTypeDep extends Dependency<ContractTypeConfig>() {
  abstract contractType: StripeConnectContractType
}

// ============================================================================
// Dependency Implementations
// ============================================================================

// Country implementations
CountryDep.implement('us', {
  countryCode: CountryCode.US,
  expectedCurrency: CurrencyCode.USD,
})

CountryDep.implement('de', {
  countryCode: CountryCode.DE,
  expectedCurrency: CurrencyCode.EUR,
})

CountryDep.implement('gb', {
  countryCode: CountryCode.GB,
  expectedCurrency: CurrencyCode.GBP,
})

CountryDep.implement('au', {
  countryCode: CountryCode.AU,
  expectedCurrency: CurrencyCode.AUD,
})

// Contract type implementations
ContractTypeDep.implement('platform', {
  contractType: StripeConnectContractType.Platform,
})

ContractTypeDep.implement('merchantOfRecord', {
  contractType: StripeConnectContractType.MerchantOfRecord,
})

// ============================================================================
// Behavior Definitions
// ============================================================================

/**
 * Step 1: Authenticate User
 *
 * Creates a new user record. In the real app, this happens via Better Auth
 * with a database hook. For testing, we directly insert the user.
 *
 * Postconditions:
 * - User record exists with valid id and betterAuthId
 * - User has zero organization memberships
 */
const authenticateUserBehavior = defineBehavior({
  name: 'authenticate user',
  dependencies: [],
  run: async (
    _deps,
    _prev: undefined
  ): Promise<AuthenticateUserResult> => {
    const nanoid = (await import('@/utils/core')).default.nanoid()
    const betterAuthId = `ba_${nanoid}`

    const user = await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: `usr_${nanoid}`,
          email: `test+${nanoid}@flowglad.com`,
          name: `Test User ${nanoid}`,
          betterAuthId,
        },
        transaction
      )
    })

    return { user }
  },
})

/**
 * Step 2: Create Organization
 *
 * Creates an organization for the authenticated user. This includes:
 * - Organization record with Unauthorized status
 * - Membership linking user to organization
 * - Default pricing models (livemode + testmode)
 * - Default products and prices
 * - Testmode API key
 * - Svix webhook configuration
 *
 * Postconditions:
 * - Organization exists with onboardingStatus = Unauthorized
 * - User has one membership (focused=true)
 * - Two pricing models exist (livemode + testmode)
 * - Default currency matches country configuration
 */
const createOrganizationBehavior = defineBehavior({
  name: 'create organization',
  dependencies: [CountryDep, ContractTypeDep],
  run: async (
    { countryDep, contractTypeDep },
    prev: AuthenticateUserResult
  ): Promise<CreateOrganizationResult> => {
    // setupOrg seeds countries internally, so we call it first to ensure countries exist
    // Then we use createOrganizationTransaction with the correct country
    // This is a workaround since insertCountries is not exported
    const seedResult = await setupOrg({
      countryCode: countryDep.countryCode,
      stripeConnectContractType: contractTypeDep.contractType,
    })
    // Teardown the temp org - we only needed it to seed countries
    await teardownOrg({ organizationId: seedResult.organization.id })

    const result = await adminTransaction(async ({ transaction }) => {
      // Get the country record
      const [country] = await selectCountries(
        { code: countryDep.countryCode },
        transaction
      )

      if (!country) {
        throw new Error(`Country ${countryDep.countryCode} not found`)
      }

      // Create organization using the production helper
      const { organization: clientOrg } =
        await createOrganizationTransaction(
          {
            organization: {
              name: `Test Org ${Date.now()}`,
              countryId: country.id,
              stripeConnectContractType: contractTypeDep.contractType,
            },
          },
          {
            id: prev.user.id,
            fullName: prev.user.name ?? undefined,
            email: prev.user.email,
          },
          transaction
        )

      // Get the full organization record (including stripeAccountId)
      const organization = await selectOrganizationById(
        clientOrg.id,
        transaction
      )

      // Get the membership that was created
      const [membership] = await selectMemberships(
        { userId: prev.user.id, organizationId: organization.id },
        transaction
      )

      return {
        organization,
        membership,
        country,
      }
    })

    return {
      ...prev,
      ...result,
    }
  },
})

/**
 * Step 3: Initiate Stripe Connect
 *
 * Simulates the user clicking "Connect" to start Stripe onboarding.
 * In the real app, this creates a Stripe Connect account and generates
 * an onboarding link. For testing, we simulate the state changes.
 *
 * Postconditions:
 * - Organization has stripeAccountId
 * - Organization status is PartiallyOnboarded
 * - payoutsEnabled remains false
 */
const initiateStripeConnectBehavior = defineBehavior({
  name: 'initiate stripe connect',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateOrganizationResult
  ): Promise<InitiateStripeConnectResult> => {
    // Simulate Stripe account creation
    const stripeAccountId = `acct_test_${Date.now()}`

    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
            stripeAccountId,
            onboardingStatus:
              BusinessOnboardingStatus.PartiallyOnboarded,
          },
          transaction
        )
      },
      { livemode: true }
    )

    return {
      ...prev,
      organization: {
        ...prev.organization,
        stripeAccountId,
        onboardingStatus: BusinessOnboardingStatus.PartiallyOnboarded,
      },
      stripeAccountId,
    }
  },
})

/**
 * Step 4: Complete Stripe Onboarding
 *
 * Simulates Stripe sending an account.updated webhook indicating
 * that onboarding is complete. The organization is marked as FullyOnboarded.
 *
 * Postconditions:
 * - Organization status is FullyOnboarded
 * - payoutsEnabled remains false (requires manual approval)
 * - stripeAccountId unchanged
 */
const completeStripeOnboardingBehavior = defineBehavior({
  name: 'complete stripe onboarding',
  dependencies: [],
  run: async (
    _deps,
    prev: InitiateStripeConnectResult
  ): Promise<CompleteStripeOnboardingResult> => {
    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
            onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
          },
          transaction
        )
      },
      { livemode: true }
    )

    return {
      ...prev,
      organization: {
        ...prev.organization,
        onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
      },
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
      behavior: completeStripeOnboardingBehavior,
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
