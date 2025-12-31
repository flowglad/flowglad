import { describe, expect, it } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import type { CreateOrganizationInput } from '@/db/schema/organizations'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { selectPricesAndProductByProductId } from '@/db/tableMethods/priceMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import {
  CurrencyCode,
  FlowgladApiKeyType,
  StripeConnectContractType,
} from '@/types'
import {
  cardPaymentsCountries,
  transferCountries,
} from '@/utils/countries'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { defaultCurrencyForCountry } from '@/utils/stripe'
import core from './core'

const getPlatformEligibleCountryId = async (
  transaction: Parameters<typeof selectCountries>[1]
) => {
  const countries = await selectCountries({}, transaction)
  const platformEligibleCountry = countries.find((country) =>
    cardPaymentsCountries.includes(country.code)
  )

  if (!platformEligibleCountry) {
    throw new Error(
      'Expected at least one platform-eligible country in the database.'
    )
  }

  return platformEligibleCountry.id
}

const getMoROnlyCountryId = async (
  transaction: Parameters<typeof selectCountries>[1]
) => {
  const countries = await selectCountries({}, transaction)
  const morOnlyCountry = countries.find(
    (country) =>
      transferCountries.includes(country.code) &&
      !cardPaymentsCountries.includes(country.code)
  )

  if (!morOnlyCountry) {
    throw new Error(
      'Expected at least one MoR-only country in the database.'
    )
  }

  return morOnlyCountry.id
}

/**
 * Gets a non-US Platform-eligible country for testing default currency logic.
 * This allows us to verify that Platform orgs get country-specific currencies.
 *
 * Note: Some countries (HR, CY, LI) are Platform-eligible but fall through to
 * USD in defaultCurrencyForCountry. We filter these out to ensure we test
 * with a country that has a distinct non-USD currency.
 */
const getNonUSPlatformEligibleCountry = async (
  transaction: Parameters<typeof selectCountries>[1]
) => {
  const countries = await selectCountries({}, transaction)
  const nonUSPlatformCountry = countries.find((country) => {
    if (!cardPaymentsCountries.includes(country.code)) return false
    if (country.code === 'US') return false
    // Ensure country has a non-USD default currency
    const currency = defaultCurrencyForCountry(country)
    return currency !== CurrencyCode.USD
  })

  if (!nonUSPlatformCountry) {
    throw new Error(
      'Expected at least one non-US platform-eligible country with non-USD currency in the database.'
    )
  }

  return nonUSPlatformCountry
}

/**
 * Gets a country that is eligible for both Platform and MoR flows.
 * This allows us to test MoR selection for a Platform-eligible country.
 */
const getBothEligibleCountry = async (
  transaction: Parameters<typeof selectCountries>[1]
) => {
  const countries = await selectCountries({}, transaction)
  const bothEligibleCountry = countries.find(
    (country) =>
      cardPaymentsCountries.includes(country.code) &&
      transferCountries.includes(country.code) &&
      country.code !== 'US'
  )

  if (!bothEligibleCountry) {
    throw new Error(
      'Expected at least one country eligible for both Platform and MoR in the database.'
    )
  }

  return bothEligibleCountry
}

describe('createOrganizationTransaction', () => {
  it('should create an organization', async () => {
    const organizationName = core.nanoid()
    await adminTransaction(async ({ transaction }) => {
      const countryId =
        await getPlatformEligibleCountryId(transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId,
        },
      }
      return createOrganizationTransaction(
        input,
        {
          id: core.nanoid(),
          email: `test+${core.nanoid()}@test.com`,
          fullName: 'Test User',
        },
        transaction
      )
    })
    await adminTransaction(async ({ transaction }) => {
      const [organization] = await selectOrganizations(
        {
          name: organizationName,
        },
        transaction
      )
      expect(organization).toBeDefined()

      const testmodeKeys = await selectApiKeys(
        {
          organizationId: organization.id,
          livemode: false,
        },
        transaction
      )
      /**
       * Assert that no publishable keys are created
       * - we don't support the type right now.
       */
      expect(
        testmodeKeys.some(
          (key) => key.type === FlowgladApiKeyType.Publishable
        )
      ).toBe(false)
      /**
       * Assert that a secret key is created
       */
      expect(
        testmodeKeys.some(
          (key) => key.type === FlowgladApiKeyType.Secret
        )
      ).toBe(true)
      const livemodeKeys = await selectApiKeys(
        {
          organizationId: organization.id,
          livemode: true,
        },
        transaction
      )
      /**
       * Assert that no livemode keys are created -
       * they can only be created once the organization has payouts enabled.
       */
      expect(livemodeKeys.length).toBe(0)
    })
  })

  it('should create default Free Plan products and prices for live and testmode', async () => {
    const organizationName = `org_${core.nanoid()}`
    await adminTransaction(async ({ transaction }) => {
      const countryId =
        await getPlatformEligibleCountryId(transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId,
        },
      }
      return createOrganizationTransaction(
        input,
        {
          id: core.nanoid(),
          email: `test+${core.nanoid()}@test.com`,
          fullName: 'Test User',
        },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      const [organization] = await selectOrganizations(
        { name: organizationName },
        transaction
      )
      expect(organization).toBeDefined()

      // Live default pricing model and Free Plan
      const [liveDefaultPricingModel] = await selectPricingModels(
        {
          organizationId: organization.id,
          livemode: true,
          isDefault: true,
        },
        transaction
      )
      expect(liveDefaultPricingModel?.id).toBeDefined()

      const [liveDefaultProduct] = await selectProducts(
        {
          pricingModelId: liveDefaultPricingModel.id,
          default: true,
        },
        transaction
      )
      expect(liveDefaultProduct?.id).toBeDefined()
      expect(liveDefaultProduct.name).toBe('Free Plan')
      expect(liveDefaultProduct.organizationId).toBe(organization.id)
      expect(liveDefaultProduct.livemode).toBe(true)

      const liveProductWithPrices =
        await selectPricesAndProductByProductId(
          liveDefaultProduct.id,
          transaction
        )
      expect(liveProductWithPrices.defaultPrice?.id).toBeDefined()
      expect(liveProductWithPrices.defaultPrice.name).toBe(
        'Free Plan'
      )
      expect(liveProductWithPrices.defaultPrice.unitPrice).toBe(0)
      expect(liveProductWithPrices.defaultPrice.livemode).toBe(true)
      expect(liveProductWithPrices.defaultPrice.currency).toBe(
        organization.defaultCurrency
      )

      // Testmode default pricing model and Free Plan
      const [testDefaultPricingModel] = await selectPricingModels(
        {
          organizationId: organization.id,
          livemode: false,
          isDefault: true,
        },
        transaction
      )
      expect(testDefaultPricingModel?.id).toBeDefined()

      const [testDefaultProduct] = await selectProducts(
        {
          pricingModelId: testDefaultPricingModel.id,
          default: true,
        },
        transaction
      )
      expect(testDefaultProduct?.id).toBeDefined()
      expect(testDefaultProduct.name).toBe('Free Plan')
      expect(testDefaultProduct.organizationId).toBe(organization.id)
      expect(testDefaultProduct.livemode).toBe(false)

      const testProductWithPrices =
        await selectPricesAndProductByProductId(
          testDefaultProduct.id,
          transaction
        )
      expect(testProductWithPrices.defaultPrice?.id).toBeDefined()
      expect(testProductWithPrices.defaultPrice.name).toBe(
        'Free Plan'
      )
      expect(testProductWithPrices.defaultPrice.unitPrice).toBe(0)
      expect(testProductWithPrices.defaultPrice.livemode).toBe(false)
      expect(testProductWithPrices.defaultPrice.currency).toBe(
        organization.defaultCurrency
      )
    })
  })

  it('should persist stripeConnectContractType when provided', async () => {
    const organizationName = `org_${core.nanoid()}`

    await adminTransaction(async ({ transaction }) => {
      const countryId = await getMoROnlyCountryId(transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId,
          stripeConnectContractType:
            StripeConnectContractType.MerchantOfRecord,
        },
      }

      return createOrganizationTransaction(
        input,
        {
          id: core.nanoid(),
          email: `test+${core.nanoid()}@test.com`,
          fullName: 'Test User',
        },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      const [organization] = await selectOrganizations(
        { name: organizationName },
        transaction
      )

      expect(organization.stripeConnectContractType).toBe(
        StripeConnectContractType.MerchantOfRecord
      )
    })
  })

  it('should default to MerchantOfRecord for MoR-only countries', async () => {
    const organizationName = `org_${core.nanoid()}`

    await adminTransaction(async ({ transaction }) => {
      const countryId = await getMoROnlyCountryId(transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId,
        },
      }

      return createOrganizationTransaction(
        input,
        {
          id: core.nanoid(),
          email: `test+${core.nanoid()}@test.com`,
          fullName: 'Test User',
        },
        transaction
      )
    })

    await adminTransaction(async ({ transaction }) => {
      const [organization] = await selectOrganizations(
        { name: organizationName },
        transaction
      )

      expect(organization.stripeConnectContractType).toBe(
        StripeConnectContractType.MerchantOfRecord
      )
    })
  })

  it('should reject Platform contract type for MoR-only countries', async () => {
    const organizationName = `org_${core.nanoid()}`

    const promise = adminTransaction(async ({ transaction }) => {
      const countryId = await getMoROnlyCountryId(transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId,
          stripeConnectContractType:
            StripeConnectContractType.Platform,
        },
      }

      return createOrganizationTransaction(
        input,
        {
          id: core.nanoid(),
          email: `test+${core.nanoid()}@test.com`,
          fullName: 'Test User',
        },
        transaction
      )
    })

    await expect(promise).rejects.toThrow(
      /Stripe Connect contract type .* is not supported/
    )
  })

  describe('defaultCurrency enforcement for MoR organizations', () => {
    it('should set defaultCurrency to USD for MoR organizations regardless of country', async () => {
      const organizationName = `org_${core.nanoid()}`

      await adminTransaction(async ({ transaction }) => {
        const countryId = await getMoROnlyCountryId(transaction)
        const input: CreateOrganizationInput = {
          organization: {
            name: organizationName,
            countryId,
            stripeConnectContractType:
              StripeConnectContractType.MerchantOfRecord,
          },
        }

        return createOrganizationTransaction(
          input,
          {
            id: core.nanoid(),
            email: `test+${core.nanoid()}@test.com`,
            fullName: 'Test User',
          },
          transaction
        )
      })

      await adminTransaction(async ({ transaction }) => {
        const [organization] = await selectOrganizations(
          { name: organizationName },
          transaction
        )

        expect(organization.stripeConnectContractType).toBe(
          StripeConnectContractType.MerchantOfRecord
        )
        expect(organization.defaultCurrency).toBe(CurrencyCode.USD)
      })
    })

    it('should set defaultCurrency to USD for MoR orgs even when country is Platform-eligible', async () => {
      const organizationName = `org_${core.nanoid()}`

      await adminTransaction(async ({ transaction }) => {
        const bothEligibleCountry =
          await getBothEligibleCountry(transaction)
        const input: CreateOrganizationInput = {
          organization: {
            name: organizationName,
            countryId: bothEligibleCountry.id,
            stripeConnectContractType:
              StripeConnectContractType.MerchantOfRecord,
          },
        }

        return createOrganizationTransaction(
          input,
          {
            id: core.nanoid(),
            email: `test+${core.nanoid()}@test.com`,
            fullName: 'Test User',
          },
          transaction
        )
      })

      await adminTransaction(async ({ transaction }) => {
        const [organization] = await selectOrganizations(
          { name: organizationName },
          transaction
        )

        expect(organization.stripeConnectContractType).toBe(
          StripeConnectContractType.MerchantOfRecord
        )
        // MoR orgs always get USD, even if the country has a different default currency
        expect(organization.defaultCurrency).toBe(CurrencyCode.USD)
      })
    })

    it('should set defaultCurrency based on country for Platform organizations', async () => {
      const organizationName = `org_${core.nanoid()}`

      await adminTransaction(async ({ transaction }) => {
        const nonUSPlatformCountry =
          await getNonUSPlatformEligibleCountry(transaction)
        const expectedCurrency = defaultCurrencyForCountry(
          nonUSPlatformCountry
        )

        const input: CreateOrganizationInput = {
          organization: {
            name: organizationName,
            countryId: nonUSPlatformCountry.id,
            stripeConnectContractType:
              StripeConnectContractType.Platform,
          },
        }

        await createOrganizationTransaction(
          input,
          {
            id: core.nanoid(),
            email: `test+${core.nanoid()}@test.com`,
            fullName: 'Test User',
          },
          transaction
        )

        const [organization] = await selectOrganizations(
          { name: organizationName },
          transaction
        )

        expect(organization.stripeConnectContractType).toBe(
          StripeConnectContractType.Platform
        )
        // Platform orgs get the country's default currency
        expect(organization.defaultCurrency).toBe(expectedCurrency)
        // Verify it's not USD (unless the country's default happens to be USD)
        // This test uses a non-US country, so it should have a different currency
        expect(expectedCurrency).not.toBe(CurrencyCode.USD)
      })
    })

    it('should set defaultCurrency to USD for US Platform organizations', async () => {
      const organizationName = `org_${core.nanoid()}`

      await adminTransaction(async ({ transaction }) => {
        const countries = await selectCountries({}, transaction)
        const usCountry = countries.find(
          (country) => country.code === 'US'
        )

        if (!usCountry) {
          throw new Error('Expected US country in the database.')
        }

        const input: CreateOrganizationInput = {
          organization: {
            name: organizationName,
            countryId: usCountry.id,
            stripeConnectContractType:
              StripeConnectContractType.Platform,
          },
        }

        await createOrganizationTransaction(
          input,
          {
            id: core.nanoid(),
            email: `test+${core.nanoid()}@test.com`,
            fullName: 'Test User',
          },
          transaction
        )

        const [organization] = await selectOrganizations(
          { name: organizationName },
          transaction
        )

        expect(organization.stripeConnectContractType).toBe(
          StripeConnectContractType.Platform
        )
        // US Platform orgs should also have USD (via defaultCurrencyForCountry)
        expect(organization.defaultCurrency).toBe(CurrencyCode.USD)
      })
    })

    it('should default MoR-only countries to USD currency when contract type is auto-selected', async () => {
      const organizationName = `org_${core.nanoid()}`

      await adminTransaction(async ({ transaction }) => {
        const countryId = await getMoROnlyCountryId(transaction)
        // Don't explicitly set stripeConnectContractType - let it auto-select MoR
        const input: CreateOrganizationInput = {
          organization: {
            name: organizationName,
            countryId,
          },
        }

        return createOrganizationTransaction(
          input,
          {
            id: core.nanoid(),
            email: `test+${core.nanoid()}@test.com`,
            fullName: 'Test User',
          },
          transaction
        )
      })

      await adminTransaction(async ({ transaction }) => {
        const [organization] = await selectOrganizations(
          { name: organizationName },
          transaction
        )

        // Should auto-select MoR for MoR-only countries
        expect(organization.stripeConnectContractType).toBe(
          StripeConnectContractType.MerchantOfRecord
        )
        // And should enforce USD as the default currency
        expect(organization.defaultCurrency).toBe(CurrencyCode.USD)
      })
    })
  })
})
