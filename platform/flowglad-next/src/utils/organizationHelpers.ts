import { customAlphabet, nanoid } from 'nanoid'
import {
  insertOrDoNothingOrganizationByExternalId,
  selectOrganizations,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import {
  BusinessOnboardingStatus,
  FeatureFlag,
  FlowgladApiKeyType,
  StripeConnectContractType,
} from '@/types'
import { DbTransaction } from '@/db/types'
import { upsertUserById } from '@/db/tableMethods/userMethods'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import { defaultCurrencyForCountry } from '@/utils/stripe'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import { createSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import {
  CreateOrganizationInput,
  Organization,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'
import { insertPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { findOrCreateSvixApplication } from './svix'

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
  const currentEpochHour = Math.floor(Date.now() / 1000 / 3600)
  const organizationRecord =
    await insertOrDoNothingOrganizationByExternalId(
      {
        ...organization,
        subdomainSlug: finalSubdomainSlug,
        securitySalt: nanoid(128),
        /**
         * This is the default fee for non merchant of record organizations
         */
        feePercentage: '0.65',
        onboardingStatus: BusinessOnboardingStatus.Unauthorized,
        stripeConnectContractType: StripeConnectContractType.Platform,
        defaultCurrency: defaultCurrencyForCountry(country),
        /**
         * Use this hash to prevent a race condition where a user may accidentally double-submit createOrganization
         */
        externalId: `${user.id}-${organization.name}-${currentEpochHour}`,
        featureFlags: {},
      },
      transaction
    )
  const organizationId = organizationRecord.id
  await insertMembership(
    {
      organizationId,
      userId: user.id,
      focused: true,
      /**
       * Deliberate - we need them to onboard into test mode so they can quickly see what the
       * checkout experience is like
       */
      livemode: false,
    },
    transaction
  )

  const {
    result: { pricingModel: defaultLivePricingModel },
  } = await createPricingModelBookkeeping(
    {
      pricingModel: {
        name: 'Default',
        isDefault: true,
      },
    },
    {
      transaction,
      organizationId,
      livemode: true,
    }
  )

  const {
    result: { pricingModel: defaultTestmodePricingModel },
  } = await createPricingModelBookkeeping(
    {
      pricingModel: {
        name: 'Default (testmode)',
        isDefault: true,
      },
    },
    {
      transaction,
      organizationId,
      livemode: false,
    }
  )

  // Default products and prices for both livemode and testmode pricing models
  // are created by createPricingModelBookkeeping above (as "Free Plan").

  await createSecretApiKeyTransaction(
    {
      apiKey: {
        name: 'Secret Testmode Key',
        type: FlowgladApiKeyType.Secret,
      },
    },
    {
      transaction,
      livemode: false,
      userId,
      organizationId,
    }
  )

  await findOrCreateSvixApplication({
    organization: organizationRecord,
    livemode: false,
  })

  await findOrCreateSvixApplication({
    organization: organizationRecord,
    livemode: true,
  })

  return {
    organization: organizationsClientSelectSchema.parse(
      organizationRecord
    ),
  }
}

export const hasFeatureFlag = (
  organization: Organization.ClientRecord | null | undefined,
  featureFlag: FeatureFlag
) => {
  if (!organization) {
    return false
  }
  return organization.featureFlags?.[featureFlag] ?? false
}
