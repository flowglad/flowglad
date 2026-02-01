import {
  BusinessOnboardingStatus,
  CurrencyCode,
  FlowgladApiKeyType,
  MembershipRole,
  StripeConnectContractType,
} from '@db-core/enums'
import {
  type CreateOrganizationInput,
  type Organization,
  organizationsClientSelectSchema,
} from '@db-core/schema/organizations'
import { customAlphabet, nanoid } from 'nanoid'
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
import {
  type CacheRecomputationContext,
  createTransactionEffectsContext,
  type DbTransaction,
} from '@/db/types'
import { type FeatureFlag } from '@/types'
import { createSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { createPricingModelBookkeeping } from '@/utils/bookkeeping'
import core from '@/utils/core'
import {
  countryNameByCountryCode,
  getEligibleFundsFlowsForCountry,
} from '@/utils/countries'
import { defaultCurrencyForCountry } from '@/utils/stripe'

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
  transaction: DbTransaction,
  cacheRecomputationContext: CacheRecomputationContext
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
  const existingOrganizations = await selectOrganizations(
    { subdomainSlug },
    transaction
  )
  let finalSubdomainSlug = subdomainSlug
  if (existingOrganizations.length > 0) {
    const suffix = mininanoid()
    finalSubdomainSlug = `${subdomainSlug}-${suffix}`
  }

  const country = (
    await selectCountryById(organization.countryId, transaction)
  ).unwrap()
  const countryName =
    countryNameByCountryCode[
      country.code as keyof typeof countryNameByCountryCode
    ] ?? country.code
  const eligibleFlows = getEligibleFundsFlowsForCountry(country.code)
  if (eligibleFlows.length === 0) {
    throw new Error(
      `${countryName} is not currently supported for payments. See supported countries: https://docs.flowglad.com/countries`
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

  // In production, check if country is MoR-only (not eligible for Platform)
  if (
    core.IS_PROD &&
    !eligibleFlows.includes(StripeConnectContractType.Platform)
  ) {
    throw new Error(
      `${countryName} is not yet supported. We're working on expanding to more countries soon. See supported countries: https://docs.flowglad.com/countries`
    )
  }

  const stripeConnectContractType = core.IS_PROD
    ? StripeConnectContractType.Platform
    : (requestedStripeConnectContractType ??
      defaultStripeConnectContractTypeForCountry(eligibleFlows))

  if (!eligibleFlows.includes(stripeConnectContractType)) {
    throw new Error(
      `The selected payment configuration is not available in ${countryName}. See supported countries: https://docs.flowglad.com/countries`
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
        /**
         * MoR organizations always use USD as their default currency
         * to simplify tax reporting and payout calculations.
         */
        defaultCurrency:
          stripeConnectContractType ===
          StripeConnectContractType.MerchantOfRecord
            ? CurrencyCode.USD
            : defaultCurrencyForCountry(country),
        /**
         * Use this hash to prevent a race condition where a user may accidentally double-submit createOrganization
         */
        externalId: `${user.id}-${organization.name}-${currentEpochHour}`,
        featureFlags: {},
      },
      transaction
    )

  if (!organizationRecord) {
    console.error(
      '[createOrganizationTransaction] insertOrDoNothingOrganizationByExternalId returned undefined',
      {
        userId: user.id,
        organizationName: organization.name,
        externalId: `${user.id}-${organization.name}-${currentEpochHour}`,
        subdomainSlug: finalSubdomainSlug,
      }
    )
    throw new Error(
      'Failed to create or find organization. Please try again.'
    )
  }

  const organizationId = organizationRecord.id

  // Create TransactionEffectsContext with noop callbacks for organization setup.
  // This is valid because new entities don't have anything to invalidate in the cache.
  const ctx = createTransactionEffectsContext(
    transaction,
    cacheRecomputationContext
  )

  // Create pricing models BEFORE the membership so we can set focusedPricingModelId
  const { pricingModel: defaultLivePricingModel } = (
    await createPricingModelBookkeeping(
      {
        pricingModel: {
          name: 'Pricing Model',
          isDefault: true,
        },
      },
      { ...ctx, organizationId, livemode: true }
    )
  ).unwrap()

  const { pricingModel: defaultTestmodePricingModel } = (
    await createPricingModelBookkeeping(
      {
        pricingModel: {
          name: '[TEST] Pricing Model',
          isDefault: true,
        },
      },
      { ...ctx, organizationId, livemode: false }
    )
  ).unwrap()

  // Now create the membership with focusedPricingModelId set to the default test PM
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
      role: MembershipRole.Owner,
      focusedPricingModelId: defaultTestmodePricingModel.id,
    },
    transaction
  )

  // Default products and prices for both livemode and testmode pricing models
  // are created by createPricingModelBookkeeping above (as "Free Plan").

  await createSecretApiKeyTransaction(
    {
      apiKey: {
        name: 'Secret Testmode Key',
        type: FlowgladApiKeyType.Secret,
        pricingModelId: defaultTestmodePricingModel.id,
      },
    },
    {
      ...ctx,
      effects: {
        cacheInvalidations: [],
        eventsToInsert: [],
        ledgerCommands: [],
      },
      livemode: false,
      userId,
      organizationId,
    }
  )

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
