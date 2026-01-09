/**
 * Shared Organization Behaviors
 *
 * Reusable behaviors for setting up organizations in behavior tests.
 */

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
import { insertUser } from '@/db/tableMethods/userMethods'
import {
  BusinessOnboardingStatus,
  CountryCode,
  CurrencyCode,
  StripeConnectContractType,
} from '@/types'
import core from '@/utils/core'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { Dependency, defineBehavior } from '../index'

// ============================================================================
// Result Types
// ============================================================================

export interface AuthenticateUserResult {
  user: User.Record
}

export interface CreateOrganizationResult
  extends AuthenticateUserResult {
  organization: Organization.Record
  membership: Membership.Record
  country: Country.Record
}

export interface CompleteStripeOnboardingResult
  extends CreateOrganizationResult {
  stripeAccountId: string
}

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

export abstract class CountryDep extends Dependency<CountryConfig>() {
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

export abstract class ContractTypeDep extends Dependency<ContractTypeConfig>() {
  abstract contractType: StripeConnectContractType
}

// ============================================================================
// Default Dependency Implementations
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
 * Authenticate User Behavior
 *
 * Creates a new user record. In the real app, this happens via Better Auth
 * with a database hook. For testing, we directly insert the user.
 *
 * Postconditions:
 * - User record exists with valid id and betterAuthId
 * - User has zero organization memberships
 */
export const authenticateUserBehavior = defineBehavior({
  name: 'authenticate user',
  dependencies: [],
  run: async (
    _deps,
    _prev: undefined
  ): Promise<AuthenticateUserResult> => {
    const nanoid = core.nanoid()
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
 * Create Organization Behavior
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
export const createOrganizationBehavior = defineBehavior({
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
              name: `Test Org ${core.nanoid()}`,
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
 * Complete Stripe Onboarding Behavior
 *
 * Simulates the full Stripe Connect onboarding flow:
 * 1. Creates a Stripe Connect account
 * 2. Marks onboarding as PartiallyOnboarded
 * 3. Marks onboarding as FullyOnboarded
 *
 * This is a simplified version that combines the initiate and complete steps
 * for tests that don't need to test the intermediate states.
 *
 * Postconditions:
 * - Organization has stripeAccountId
 * - Organization status is FullyOnboarded
 * - payoutsEnabled remains false (requires manual approval)
 */
export const completeStripeOnboardingBehavior = defineBehavior({
  name: 'complete stripe onboarding',
  dependencies: [],
  run: async (
    _deps,
    prev: CreateOrganizationResult
  ): Promise<CompleteStripeOnboardingResult> => {
    const stripeAccountId = `acct_test_${Date.now()}`

    await adminTransaction(
      async ({ transaction }) => {
        await updateOrganization(
          {
            id: prev.organization.id,
            stripeAccountId,
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
        stripeAccountId,
        onboardingStatus: BusinessOnboardingStatus.FullyOnboarded,
      },
      stripeAccountId,
    }
  },
})
