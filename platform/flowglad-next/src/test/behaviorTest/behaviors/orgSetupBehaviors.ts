/**
 * Organization Setup Behaviors
 *
 * Behaviors for creating and configuring organizations in behavior tests.
 */

import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Country } from '@/db/schema/countries'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import core from '@/utils/core'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { ContractTypeDep } from '../dependencies/contractTypeDependencies'
import { CountryDep } from '../dependencies/countryDependencies'
import { defineBehavior } from '../index'
import type { AuthenticateUserResult } from './authBehaviors'

// ============================================================================
// Result Types
// ============================================================================

export interface CreateOrganizationResult
  extends AuthenticateUserResult {
  organization: Organization.Record
  membership: Membership.Record
  country: Country.Record
}

// ============================================================================
// Behaviors
// ============================================================================

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
