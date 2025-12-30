import { customAlphabet, nanoid } from 'nanoid'
import {
  type CreateOrganizationInput,
  type Organization,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import {
  insertMembership,
  unfocusMembershipsForUser,
} from '@/db/tableMethods/membershipMethods'
import {
  insertOrDoNothingOrganizationByExternalId,
  selectOrganizations,
} from '@/db/tableMethods/organizationMethods'
import { upsertUserById } from '@/db/tableMethods/userMethods'
import type { DbTransaction } from '@/db/types'
import {
  BusinessOnboardingStatus,
  type FeatureFlag,
  FlowgladApiKeyType,
  StripeConnectContractType,
} from '@/types'
import { createSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import core from '@/utils/core'
import { getEligibleFundsFlowsForCountry } from '@/utils/countries'
import { defaultCurrencyForCountry } from '@/utils/stripe'
import { findOrCreateSvixApplication } from '@/utils/svix'

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

/**
 * Defaults funds flow selection based on the country's eligibility.
 *
 * This ensures org creation is possible for countries that are MoR-only even
 * before the client UI supports choosing a funds flow explicitly.
 */
const defaultStripeConnectContractTypeForCountry = (
  eligibleFlows: StripeConnectContractType[]
): StripeConnectContractType => {
  if (eligibleFlows.includes(StripeConnectContractType.Platform)) {
    return StripeConnectContractType.Platform
  }
  return StripeConnectContractType.MerchantOfRecord
}

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
  const eligibleFlows = getEligibleFundsFlowsForCountry(country.code)
  if (eligibleFlows.length === 0) {
    throw new Error(
      `Country ${country.code} is not eligible for payments`
    )
  }

  const requestedStripeConnectContractType =
    organization.stripeConnectContractType

  if (
    core.IS_PROD &&
    requestedStripeConnectContractType ===
      StripeConnectContractType.MerchantOfRecord
  ) {
    throw new Error(
      'Merchant-of-record funds flow is not available in production yet.'
    )
  }

  const stripeConnectContractType = core.IS_PROD
    ? StripeConnectContractType.Platform
    : (requestedStripeConnectContractType ??
      defaultStripeConnectContractTypeForCountry(eligibleFlows))

  if (!eligibleFlows.includes(stripeConnectContractType)) {
    throw new Error(
      `Stripe Connect contract type ${stripeConnectContractType} is not supported for country ${country.code}`
    )
  }

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
        stripeConnectContractType,
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
  await unfocusMembershipsForUser(user.id, transaction)
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
        name: 'Pricing Model',
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
        name: '[TEST] Pricing Model',
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
