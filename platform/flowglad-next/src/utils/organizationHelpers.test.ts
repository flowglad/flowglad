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
  FlowgladApiKeyType,
  StripeConnectContractType,
} from '@/types'
import {
  cardPaymentsCountries,
  transferCountries,
} from '@/utils/countries'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
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
})
