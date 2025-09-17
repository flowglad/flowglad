import { describe, it, expect } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { CreateOrganizationInput } from '@/db/schema/organizations'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import core from './core'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { FlowgladApiKeyType } from '@/types'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectPricesAndProductByProductId } from '@/db/tableMethods/priceMethods'

describe('createOrganizationTransaction', () => {
  it('should create an organization', async () => {
    const organizationName = core.nanoid()
    await adminTransaction(async ({ transaction }) => {
      const [country] = await selectCountries({}, transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId: country.id,
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
      const [country] = await selectCountries({}, transaction)
      const input: CreateOrganizationInput = {
        organization: {
          name: organizationName,
          countryId: country.id,
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

      const liveProductWithPrices = await selectPricesAndProductByProductId(
        liveDefaultProduct.id,
        transaction
      )
      expect(liveProductWithPrices.defaultPrice?.id).toBeDefined()
      expect(liveProductWithPrices.defaultPrice.name).toBe('Free Plan')
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

      const testProductWithPrices = await selectPricesAndProductByProductId(
        testDefaultProduct.id,
        transaction
      )
      expect(testProductWithPrices.defaultPrice?.id).toBeDefined()
      expect(testProductWithPrices.defaultPrice.name).toBe('Free Plan')
      expect(testProductWithPrices.defaultPrice.unitPrice).toBe(0)
      expect(testProductWithPrices.defaultPrice.livemode).toBe(false)
      expect(testProductWithPrices.defaultPrice.currency).toBe(
        organization.defaultCurrency
      )
    })
  })
})
