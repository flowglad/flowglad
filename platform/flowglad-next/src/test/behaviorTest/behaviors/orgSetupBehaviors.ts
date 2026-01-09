/**
 * Organization Setup Behaviors
 *
 * Behaviors representing organization creation and initial configuration.
 *
 * ## Product Context
 *
 * Organizations are the core billing entity in Flowglad. Every product,
 * price, customer, and transaction belongs to an organization. Before
 * a user can sell anything, they must create an organization.
 *
 * ## User Journey
 *
 * After authenticating, a user creates their organization. This is typically
 * the first action after sign-up, triggered via the onboarding flow or
 * dashboard. The organization starts in an "Unauthorized" state, meaning
 * they haven't yet connected their Stripe account for payouts.
 *
 * ## Dependency Configuration
 *
 * Organization creation depends on:
 * - **CountryDep**: Determines default currency and tax jurisdiction
 * - **ContractTypeDep**: Platform vs MoR affects fee structure and compliance
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

/**
 * Result of creating an organization.
 *
 * Contains all entities created during organization setup, providing
 * the foundation for product creation, customer management, and billing.
 */
export interface CreateOrganizationResult
  extends AuthenticateUserResult {
  /** The created organization record */
  organization: Organization.Record
  /** The membership linking the user to the organization */
  membership: Membership.Record
  /** The country record determining tax and currency defaults */
  country: Country.Record
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Create Organization Behavior
 *
 * Represents a user creating their organization after authentication.
 *
 * ## Real-World Flow
 *
 * In production, this happens when a user completes the organization creation
 * form, providing their business name and country. The system creates all
 * necessary infrastructure for billing operations.
 *
 * ## What Gets Created
 *
 * - **Organization**: Core entity with billing configuration
 * - **Membership**: Links user to organization with admin role
 * - **Pricing Models**: Default models for livemode and testmode
 * - **Default Products**: Starter products for each mode
 * - **API Key**: Testmode key for integration development
 * - **Webhook Endpoint**: Svix-managed webhook configuration
 *
 * ## Currency Selection
 *
 * - **Platform** contracts: Currency matches the organization's country
 * - **MoR** contracts: Always USD (Flowglad handles currency conversion)
 *
 * ## Postconditions
 *
 * - Organization exists with:
 *   - `id`: Organization ID (format: `org_*`)
 *   - `onboardingStatus`: Unauthorized (no Stripe connection yet)
 *   - `payoutsEnabled`: false (requires Stripe onboarding)
 *   - `defaultCurrency`: Based on country or USD for MoR
 *   - `stripeConnectContractType`: Platform or MerchantOfRecord
 * - User has exactly one membership:
 *   - `focused`: true (this is their active organization)
 *   - Linked to the organization
 * - Two pricing models exist (one livemode, one testmode)
 * - Default products and prices exist for each mode
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
