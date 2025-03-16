import { customAlphabet } from 'nanoid'
import { adminTransaction } from '@/db/databaseMethods'
import {
  insertOrganization,
  selectOrganizations,
} from '@/db/tableMethods/organizationMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import {
  BusinessOnboardingStatus,
  FlowgladApiKeyType,
  StripeConnectContractType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { upsertUserById } from '@/db/tableMethods/userMethods'
import { createProductTransaction } from '@/utils/catalog'
import { dummyProduct } from '@/stubs/productStubs'
import { subscriptionDummyVariant } from '@/stubs/variantStubs'
import { defaultCurrencyForCountry } from '@/utils/stripe'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import { createApiKeyTransaction } from '@/utils/apiKeyHelpers'
import {
  CreateOrganizationInput,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'

const generateSubdomainSlug = (name: string) => {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .slice(0, 50) // Enforce max length - 63 is the max for subdomains, but we'll be using 50 to make room for distinguishing suffix
      .replace(/^[^a-z0-9]+/, '') // Ensure starts with alphanumeric
      .replace(/[^a-z0-9]+$/, '') || // Ensure ends with alphanumeric
    'invalid-subdomain'
  ) // Fallback if result is empty
}

const mininanoid = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  6
)

export const createOrganizationTransaction = async (
  input: CreateOrganizationInput,
  user: { id: string; fullName?: string; email: string },
  transaction: DbTransaction
) => {
  const userId = user.id
  const { organization } = input

  await upsertUserById(
    {
      id: user.id,
      name: user.fullName ?? undefined,
      email: user.email,
      stackAuthId: user.id,
    },
    transaction
  )

  /**
   * Attempts to find an organization with the same subdomain slug.
   * If found, it will generate a suffix and append it to the subdomain slug
   * to deduplicate them.
   */
  const subdomainSlug = generateSubdomainSlug(organization.name)
  const existingOrganization = await selectOrganizations(
    { subdomainSlug },
    transaction
  )
  let finalSubdomainSlug = subdomainSlug
  if (existingOrganization) {
    const suffix = mininanoid()
    finalSubdomainSlug = `${subdomainSlug}-${suffix}`
  }

  const country = await selectCountryById(
    organization.countryId,
    transaction
  )

  const organizationRecord = await insertOrganization(
    {
      ...organization,
      subdomainSlug: finalSubdomainSlug,
      /**
       * This is the default fee for non merchant of record organizations
       */
      feePercentage: '1.00',
      onboardingStatus: BusinessOnboardingStatus.Unauthorized,
      stripeConnectContractType: StripeConnectContractType.Platform,
      defaultCurrency: defaultCurrencyForCountry(country),
    },
    transaction
  )

  await insertMembership(
    {
      organizationId: organizationRecord.id,
      userId: user.id,
      stackAuthUserId: user.id,
      focused: true,
      /**
       * Deliberate - we need them to onboard into test mode so they can quickly see what the
       * checkout experience is like
       */
      livemode: false,
    },
    transaction
  )
  await createProductTransaction(
    {
      product: dummyProduct,
      variants: [
        {
          ...subscriptionDummyVariant,
          isDefault: true,
        },
      ],
    },
    { transaction, livemode: false, userId }
  )
  await createApiKeyTransaction(
    {
      apiKey: {
        name: 'Secret Testmode Key',
        type: FlowgladApiKeyType.Secret,
      },
    },
    { transaction, livemode: false, userId }
  )
  await createApiKeyTransaction(
    {
      apiKey: {
        name: 'Publishable Testmode Key',
        type: FlowgladApiKeyType.Publishable,
      },
    },
    { transaction, livemode: false, userId }
  )
  await createApiKeyTransaction(
    {
      apiKey: {
        name: 'Publishable Livemode Key',
        type: FlowgladApiKeyType.Publishable,
      },
    },
    { transaction, livemode: true, userId }
  )

  return {
    organization: organizationsClientSelectSchema.parse(
      organizationRecord
    ),
  }
}
