import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupProductFeature,
  setupToggleFeature,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { safelyUpdatePrice } from './priceMethods'
import {
  safelyInsertPricingModel,
  safelyUpdatePricingModel,
  selectPricingModelById,
  selectPricingModelForCustomer,
  selectPricingModelSlugResolutionData,
  selectPricingModels,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from './pricingModelMethods'

describe('safelyUpdatePricingModel', () => {
  let organization: Organization.Record
  let pricingModelA: PricingModel.Record // default
  let pricingModelB: PricingModel.Record // not default

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModelA = orgData.pricingModel

    pricingModelB = await setupPricingModel({
      organizationId: organization.id,
      name: 'Non-Default PricingModel',
      isDefault: false,
    })
  })

  it('should make a non-default pricingModel the new default, and unset the old default', async () => {
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePricingModel(
        { id: pricingModelB.id, isDefault: true },
        transaction
      )
    })

    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )
    const updatedPricingModelB = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelB.id, transaction)
    )

    expect(updatedPricingModelB.isDefault).toBe(true)
    expect(updatedPricingModelA.isDefault).toBe(false)
  })

  it("should update a non-default pricingModel's properties without affecting the default status of other pricingModels", async () => {
    const newName = 'New PricingModel Name'
    const updatedPricingModelB = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdatePricingModel(
          { id: pricingModelB.id, name: newName },
          transaction
        )
      }
    )

    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )

    expect(updatedPricingModelB.name).toBe(newName)
    expect(updatedPricingModelB.isDefault).toBe(false)
    expect(updatedPricingModelA.isDefault).toBe(true)
  })

  it('should allow unsetting a default pricingModel, leaving the organization with no default', async () => {
    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdatePricingModel(
          { id: pricingModelA.id, isDefault: false },
          transaction
        )
      }
    )

    expect(updatedPricingModelA.isDefault).toBe(false)
  })

  it('should update a property on a default pricingModel without changing its default status', async () => {
    const newName = 'New Name For Default PricingModel'
    const updatedPricingModelA = await adminTransaction(
      async ({ transaction }) => {
        return await safelyUpdatePricingModel(
          { id: pricingModelA.id, name: newName },
          transaction
        )
      }
    )

    expect(updatedPricingModelA.name).toBe(newName)
    expect(updatedPricingModelA.isDefault).toBe(true)
  })

  it('should not affect the default pricingModel of another organization', async () => {
    // The beforeEach creates our primary organization and its pricingModels.
    // Now, set up a completely separate organization with its own default pricingModel.
    const otherOrgData = await setupOrg()
    const otherOrgDefaultPricingModel = otherOrgData.pricingModel

    // Action: Make pricingModelB the new default for the FIRST organization.
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePricingModel(
        { id: pricingModelB.id, isDefault: true },
        transaction
      )
    })

    // Expect: The default pricingModel for the second organization remains unchanged.
    const refreshedOtherOrgPricingModel = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          otherOrgDefaultPricingModel.id,
          transaction
        )
    )
    expect(refreshedOtherOrgPricingModel.isDefault).toBe(true)

    // Sanity check: The old default for the first organization should now be false.
    const refreshedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )
    expect(refreshedPricingModelA.isDefault).toBe(false)
  })

  it('should not affect default pricingModels across livemode boundaries when updating', async () => {
    // Get the testmode pricing model that setupOrg already created
    const testModePricingModel = await adminTransaction(
      async ({ transaction }) => {
        const [pricingModel] = await selectPricingModels(
          {
            organizationId: organization.id,
            livemode: false,
            isDefault: true,
          },
          transaction
        )
        return pricingModel!
      }
    )

    // Verify we have two default pricing models - one for each livemode
    expect(pricingModelA.isDefault).toBe(true)
    expect(pricingModelA.livemode).toBe(true)
    expect(testModePricingModel.isDefault).toBe(true)
    expect(testModePricingModel.livemode).toBe(false)

    // Make pricingModelB (livemode: true) the new default
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePricingModel(
        { id: pricingModelB.id, isDefault: true },
        transaction
      )
    })

    // Check that only the livemode: true default was affected
    const refreshedPricingModelA = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelA.id, transaction)
    )
    const refreshedPricingModelB = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(pricingModelB.id, transaction)
    )
    const refreshedTestModePricingModel = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(testModePricingModel.id, transaction)
    )

    // pricingModelB should now be the default for livemode: true
    expect(refreshedPricingModelB.isDefault).toBe(true)
    expect(refreshedPricingModelB.livemode).toBe(true)

    // pricingModelA should no longer be default
    expect(refreshedPricingModelA.isDefault).toBe(false)
    expect(refreshedPricingModelA.livemode).toBe(true)

    // Test mode default should remain unchanged
    expect(refreshedTestModePricingModel.isDefault).toBe(true)
    expect(refreshedTestModePricingModel.livemode).toBe(false)
  })
})

describe('safelyInsertPricingModel', () => {
  let organization: Organization.Record
  let existingDefaultPricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    existingDefaultPricingModel = orgData.pricingModel // This is the default pricingModel
  })

  it('should make the new pricingModel the default and unset the old default', async () => {
    const newPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'New Default PricingModel',
            organizationId: organization.id,
            isDefault: true,
            livemode: true,
          },
          transaction
        )
      }
    )

    const refreshedOldDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          existingDefaultPricingModel.id,
          transaction
        )
    )

    expect(newPricingModel.isDefault).toBe(true)
    expect(refreshedOldDefault.isDefault).toBe(false)
  })

  it('should insert a non-default pricingModel without affecting the existing default', async () => {
    const newPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'New Non-Default PricingModel',
            organizationId: organization.id,
            isDefault: false,
            livemode: true,
          },
          transaction
        )
      }
    )

    const refreshedOldDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          existingDefaultPricingModel.id,
          transaction
        )
    )

    expect(newPricingModel.isDefault).toBe(false)
    expect(refreshedOldDefault.isDefault).toBe(true)
  })

  it('should not affect the default pricingModel of another organization when inserting a new default', async () => {
    // Setup a second organization with its own default pricingModel
    const otherOrgData = await setupOrg()
    const otherOrgDefaultPricingModel = otherOrgData.pricingModel

    // Insert a new default pricingModel for the FIRST organization
    await adminTransaction(async ({ transaction }) => {
      return safelyInsertPricingModel(
        {
          name: 'New Default PricingModel for Org 1',
          organizationId: organization.id,
          isDefault: true,
          livemode: true,
        },
        transaction
      )
    })

    // Check that the second org's default pricingModel is untouched
    const refreshedOtherOrgPricingModel = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          otherOrgDefaultPricingModel.id,
          transaction
        )
    )
    expect(refreshedOtherOrgPricingModel.isDefault).toBe(true)
  })

  it('should not affect default pricingModels across livemode boundaries when inserting', async () => {
    // Create a test mode (livemode: false) default pricing model for the same organization
    const testModeDefaultPricingModel = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'Test Mode Default PricingModel',
            organizationId: organization.id,
            isDefault: true,
            livemode: false,
          },
          transaction
        )
      }
    )

    // Verify we have two default pricing models - one for each livemode
    expect(existingDefaultPricingModel.isDefault).toBe(true)
    expect(existingDefaultPricingModel.livemode).toBe(true)
    expect(testModeDefaultPricingModel.isDefault).toBe(true)
    expect(testModeDefaultPricingModel.livemode).toBe(false)

    // Insert a new default for livemode: true
    const newLivemodeDefault = await adminTransaction(
      async ({ transaction }) => {
        return safelyInsertPricingModel(
          {
            name: 'New Live Mode Default PricingModel',
            organizationId: organization.id,
            isDefault: true,
            livemode: true,
          },
          transaction
        )
      }
    )

    // Check that only the livemode: true default was affected
    const refreshedOldLivemodeDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          existingDefaultPricingModel.id,
          transaction
        )
    )
    const refreshedTestModeDefault = await adminTransaction(
      async ({ transaction }) =>
        selectPricingModelById(
          testModeDefaultPricingModel.id,
          transaction
        )
    )

    // New livemode pricing model should be default
    expect(newLivemodeDefault.isDefault).toBe(true)
    expect(newLivemodeDefault.livemode).toBe(true)

    // Old livemode default should no longer be default
    expect(refreshedOldLivemodeDefault.isDefault).toBe(false)
    expect(refreshedOldLivemodeDefault.livemode).toBe(true)

    // Test mode default should remain unchanged
    expect(refreshedTestModeDefault.isDefault).toBe(true)
    expect(refreshedTestModeDefault.livemode).toBe(false)
  })
})

describe('selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
  })

  it('should return pricing models with products and features correctly mapped', async () => {
    // Create products for the pricing model
    const product1 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product 1',
    })

    const product2 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product 2',
    })

    // Create prices for products
    await setupPrice({
      productId: product1.id,
      name: 'Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    await setupPrice({
      productId: product2.id,
      name: 'Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    // Create features
    const feature1 = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Feature 1',
      livemode: true,
    })

    const feature2 = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Feature 2',
      livemode: true,
    })

    const feature3 = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Feature 3',
      livemode: true,
    })

    // Assign features to products
    await setupProductFeature({
      productId: product1.id,
      featureId: feature1.id,
      organizationId: organization.id,
    })

    await setupProductFeature({
      productId: product1.id,
      featureId: feature2.id,
      organizationId: organization.id,
    })

    await setupProductFeature({
      productId: product2.id,
      featureId: feature3.id,
      organizationId: organization.id,
    })

    // Query the pricing models with products and features
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]

    expect(pricingModelResult.id).toBe(pricingModel.id)
    /**
     * 3 products: product1, product2, and default product created with pricing model
     */
    expect(pricingModelResult.products).toHaveLength(3)

    // Check that product 1 has features 1 and 2
    const product1Result = pricingModelResult.products.find(
      (p) => p.id === product1.id
    )
    expect(product1Result?.id).toBe(product1.id)
    expect(product1Result?.features).toHaveLength(2)
    expect(product1Result?.features.map((f) => f.id)).toContain(
      feature1.id
    )
    expect(product1Result?.features.map((f) => f.id)).toContain(
      feature2.id
    )

    // Check that product 2 has only feature 3
    const product2Result = pricingModelResult.products.find(
      (p) => p.id === product2.id
    )
    expect(product2Result?.id).toBe(product2.id)
    expect(product2Result?.features).toHaveLength(1)
    expect(product2Result?.features[0].id).toBe(feature3.id)
  })

  it('should return products with empty features array when no features are assigned', async () => {
    // Create a product without any features
    const productWithoutFeatures = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product Without Features',
    })

    // Create a price for the product
    await setupPrice({
      productId: productWithoutFeatures.id,
      name: 'Basic Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 500,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    // Query the pricing model
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Find the product without features
    const productResult = result[0].products.find(
      (p) => p.id === productWithoutFeatures.id
    )

    // Verify it has an empty features array, not null or undefined
    expect(productResult?.id).toBe(productWithoutFeatures.id)
    expect(Array.isArray(productResult?.features)).toBe(true)
    expect(productResult?.features).toHaveLength(0)
  })
})

describe('selectPricingModelForCustomer', () => {
  let organization: Organization.Record
  let defaultPricingModel: PricingModel.Record
  let specificPricingModel: PricingModel.Record
  let activeProduct: Product.Record
  let inactiveProduct: Product.Record

  beforeEach(async () => {
    // Set up organization and pricing models
    const orgData = await setupOrg()
    organization = orgData.organization
    defaultPricingModel = orgData.pricingModel // This is created as default

    // Create a specific (non-default) pricing model
    specificPricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Ion Pricing Model',
      isDefault: false,
    })

    // Create active product for both pricing models
    activeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: specificPricingModel.id,
      name: 'Active Product',
      active: true,
    })

    // Create inactive product for both pricing models
    inactiveProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: specificPricingModel.id,
      name: 'Inactive Product',
      active: false,
    })

    // Add products to default pricing model too
    await setupProduct({
      organizationId: organization.id,
      pricingModelId: defaultPricingModel.id,
      name: 'Default Active Product',
      active: true,
    })

    await setupProduct({
      organizationId: organization.id,
      pricingModelId: defaultPricingModel.id,
      name: 'Default Inactive Product',
      active: false,
    })

    // Create prices for products (required for the query to work)
    await setupPrice({
      productId: activeProduct.id,
      name: 'Active Product Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    await setupPrice({
      productId: inactiveProduct.id,
      name: 'Inactive Product Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })
  })

  it('should filter inactive products for customers with specific pricing model', async () => {
    // Create customer with specific pricing model
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test@example.com',
      pricingModelId: specificPricingModel.id,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelForCustomer(customer, transaction)
    })

    // Should return the specific pricing model
    expect(result.id).toBe(specificPricingModel.id)

    // Should only include active products
    const productNames = result.products.map((p) => p.name)
    expect(productNames).toContain('Active Product')
    expect(productNames).not.toContain('Inactive Product')

    // Verify all returned products are active
    expect(result.products.every((p) => p.active)).toBe(true)
  })

  it('should filter inactive products for customers with default pricing model', async () => {
    // Create customer without specific pricing model (uses default)
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'default@example.com',
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelForCustomer(customer, transaction)
    })

    // Should return the default pricing model
    expect(result.id).toBe(defaultPricingModel.id)
    expect(result.isDefault).toBe(true)

    // Should only include active products
    const productNames = result.products.map((p) => p.name)
    expect(productNames).not.toContain('Default Inactive Product')

    // Verify all returned products are active
    expect(result.products.every((p) => p.active)).toBe(true)
  })

  it('should fallback to default pricing model when specific model not found', async () => {
    // Create customer with non-existent pricing model ID
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'fallback@example.com',
    })

    // Manually set a non-existent pricing model ID
    const customerWithBadId = {
      ...customer,
      pricingModelId: 'nonexistent-id',
    }

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelForCustomer(
        customerWithBadId,
        transaction
      )
    })

    // Should fallback to default pricing model
    expect(result.id).toBe(defaultPricingModel.id)
    expect(result.isDefault).toBe(true)

    // Should still filter inactive products
    expect(result.products.every((p) => p.active)).toBe(true)
  })

  it('should throw error when no default pricing model exists', async () => {
    // Simulate a scenario where no default pricing model exists by using a fake org ID
    const fakeOrgId = 'org_fake_no_default'

    const customer = await setupCustomer({
      organizationId: organization.id, // Use real org for customer creation
      email: 'nodefault@example.com',
    })

    // Override the organization ID to simulate missing default
    const customerWithFakeOrg = {
      ...customer,
      organizationId: fakeOrgId,
    }

    await expect(
      adminTransaction(async ({ transaction }) => {
        return selectPricingModelForCustomer(
          customerWithFakeOrg,
          transaction
        )
      })
    ).rejects.toThrow(
      `No default pricing model found for organization ${fakeOrgId}`
    )
  })

  it('should handle customers with specific pricing model that has no products', async () => {
    // Create empty pricing model
    const emptyPricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Empty Pricing Model',
      isDefault: false,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'empty@example.com',
      pricingModelId: emptyPricingModel.id,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelForCustomer(customer, transaction)
    })

    expect(result.id).toBe(emptyPricingModel.id)
    expect(result.products).toHaveLength(0)
  })
})

describe('Feature Expiration Filtering in selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: any
  let feature1: any
  let feature2: any
  let feature3: any

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    // Create a product
    product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
    })

    // Create a price for the product
    await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    // Create features
    feature1 = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Active Feature',
      livemode: true,
    })

    feature2 = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Expired Feature',
      livemode: true,
    })

    feature3 = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Future Expired Feature',
      livemode: true,
    })
  })

  it('should filter out expired features but keep active and future-expired features', async () => {
    const now = Date.now()
    const pastTime = now - 1000 * 60 * 60 * 24 // 1 day ago
    const futureTime = now + 1000 * 60 * 60 * 24 // 1 day from now

    // Assign features to product with different expiration times
    await setupProductFeature({
      productId: product.id,
      featureId: feature1.id,
      organizationId: organization.id,
      // No expiration (null) - should be included
    })

    await setupProductFeature({
      productId: product.id,
      featureId: feature2.id,
      organizationId: organization.id,
      expiredAt: pastTime, // Expired in the past - should be filtered out
    })

    await setupProductFeature({
      productId: product.id,
      featureId: feature3.id,
      organizationId: organization.id,
      expiredAt: futureTime, // Expires in the future - should be included
    })

    // Query the pricing model
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(productResult?.id).toBe(product.id)
    expect(productResult?.features).toHaveLength(2) // Only active and future-expired

    const featureIds = productResult?.features.map((f) => f.id) || []
    expect(featureIds).toContain(feature1.id) // Active feature (no expiration)
    expect(featureIds).toContain(feature3.id) // Future-expired feature
    expect(featureIds).not.toContain(feature2.id) // Expired feature should be filtered out
  })

  it('should handle products with all expired features', async () => {
    const now = Date.now()
    const pastTime = now - 1000 * 60 * 60 * 24 // 1 day ago

    // Assign only expired features
    await setupProductFeature({
      productId: product.id,
      featureId: feature1.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })

    await setupProductFeature({
      productId: product.id,
      featureId: feature2.id,
      organizationId: organization.id,
      expiredAt: pastTime,
    })

    // Query the pricing model
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(productResult?.id).toBe(product.id)
    expect(productResult?.features).toHaveLength(0) // All features expired
    expect(Array.isArray(productResult?.features)).toBe(true) // Should be empty array, not null
  })

  it('should handle products with no features assigned', async () => {
    // Don't assign any features to the product

    // Query the pricing model
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(productResult?.id).toBe(product.id)
    expect(productResult?.features).toHaveLength(0)
    expect(Array.isArray(productResult?.features)).toBe(true)
  })

  it('should handle features that expire exactly at the current time', async () => {
    const now = Date.now()

    // Assign feature that expires exactly now
    await setupProductFeature({
      productId: product.id,
      featureId: feature1.id,
      organizationId: organization.id,
      expiredAt: now, // Expires exactly now - should be filtered out
    })

    // Query the pricing model
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(productResult?.id).toBe(product.id)
    expect(productResult?.features).toHaveLength(0) // Feature expired exactly now should be filtered out
  })

  it('should handle mixed expiration scenarios across multiple products', async () => {
    // Create a second product
    const product2 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Second Product',
    })

    // Create a price for the second product
    await setupPrice({
      productId: product2.id,
      name: 'Second Product Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    const now = Date.now()
    const pastTime = now - 1000 * 60 * 60 * 24 // 1 day ago
    const futureTime = now + 1000 * 60 * 60 * 24 // 1 day from now

    // Product 1: Mix of active, expired, and future-expired features
    await setupProductFeature({
      productId: product.id,
      featureId: feature1.id,
      organizationId: organization.id,
      // No expiration - should be included
    })

    await setupProductFeature({
      productId: product.id,
      featureId: feature2.id,
      organizationId: organization.id,
      expiredAt: pastTime, // Expired - should be filtered out
    })

    // Product 2: Only future-expired features
    await setupProductFeature({
      productId: product2.id,
      featureId: feature3.id,
      organizationId: organization.id,
      expiredAt: futureTime, // Future expired - should be included
    })

    // Query the pricing model
    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: pricingModel.id },
        transaction
      )
    })

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    expect(pricingModelResult.products).toHaveLength(3) // product, product2, and default product

    // Check product 1 features
    const product1Result = pricingModelResult.products.find(
      (p) => p.id === product.id
    )
    expect(product1Result?.features).toHaveLength(1) // Only active feature
    expect(product1Result?.features[0].id).toBe(feature1.id)

    // Check product 2 features
    const product2Result = pricingModelResult.products.find(
      (p) => p.id === product2.id
    )
    expect(product2Result?.features).toHaveLength(1) // Only future-expired feature
    expect(product2Result?.features[0].id).toBe(feature3.id)
  })
})

describe('Inactive Price Filtering in selectPricingModelForCustomer', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
  })

  it('should filter out inactive prices while preserving all active prices', async () => {
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product with Mixed Prices',
      active: true,
    })

    const activePrice1 = await setupPrice({
      productId: product.id,
      name: 'Active Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const activePrice2 = await setupPrice({
      productId: product.id,
      name: 'Active Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      trialPeriodDays: 0,
      active: true,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-customer@example.com',
      pricingModelId: pricingModel.id,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return await selectPricingModelForCustomer(
        customer,
        transaction
      )
    })

    expect(result.products).toHaveLength(2) // setupOrg + our test product

    // Find our test product
    const testProduct = result.products.find(
      (p) => p.id === product.id
    )
    expect(testProduct?.id).toBe(product.id)
    expect(testProduct!.prices).toHaveLength(1) // Only the latest active price should remain

    const returnedPrices = testProduct!.prices

    // Verify only the latest active price is preserved
    const activePrice2InResult = returnedPrices.find(
      (p) => p.id === activePrice2.id
    )
    expect(activePrice2InResult?.id).toBe(activePrice2.id)

    // Verify all returned prices are active
    returnedPrices.forEach((price) => {
      expect(price.active).toBe(true)
    })

    // Verify default price relationship
    const defaultPrice = returnedPrices.find((p) => p.isDefault)
    expect(defaultPrice?.id).toBe(activePrice2.id)
  })

  it('should filter out products with only inactive prices', async () => {
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product with Only Inactive Prices',
      active: true,
    })

    const inactivePrice1 = await setupPrice({
      productId: product.id,
      name: 'Inactive Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: false,
    })

    const inactivePrice2 = await setupPrice({
      productId: product.id,
      name: 'Inactive Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      trialPeriodDays: 0,
      active: false,
    })

    // setupPrice makes active=true and isDefault=true via safelyInsertPrice,
    // so we update both prices to be inactive and non-default
    await adminTransaction(async ({ transaction }) => {
      await safelyUpdatePrice(
        {
          id: inactivePrice1.id,
          type: PriceType.Subscription,
          active: false,
          isDefault: false,
        },
        transaction
      )
      await safelyUpdatePrice(
        {
          id: inactivePrice2.id,
          type: PriceType.Subscription,
          active: false,
          isDefault: false,
        },
        transaction
      )
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-customer@example.com',
      pricingModelId: pricingModel.id,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return await selectPricingModelForCustomer(
        customer,
        transaction
      )
    })

    expect(result.products).toHaveLength(1) // Only setupOrg product

    const productInResult = result.products.find(
      (p) => p.id === product.id
    )
    expect(productInResult).toBeUndefined()
  })

  it('should return the latest active price when product has no inactive prices', async () => {
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product with Only Active Prices',
      active: true,
    })

    const activePrice1 = await setupPrice({
      productId: product.id,
      name: 'Active Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const activePrice2 = await setupPrice({
      productId: product.id,
      name: 'Active Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      trialPeriodDays: 0,
      active: true,
    })

    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-customer@example.com',
      pricingModelId: pricingModel.id,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return await selectPricingModelForCustomer(
        customer,
        transaction
      )
    })

    expect(result.products).toHaveLength(2)

    // Find our test product
    const testProduct = result.products.find(
      (p) => p.id === product.id
    )
    expect(testProduct?.id).toBe(product.id)
    expect(testProduct!.prices).toHaveLength(1)

    const returnedPrices = testProduct!.prices
    const activePrice2InResult = returnedPrices.find(
      (p) => p.id === activePrice2.id
    )
    expect(activePrice2InResult?.id).toBe(activePrice2.id)

    // Verify all returned prices are active
    returnedPrices.forEach((price) => {
      expect(price.active).toBe(true)
    })
  })
})

describe('selectPricingModelSlugResolutionData', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
  })

  it('should return only minimal price fields (id, slug, type, usageMeterId, active)', async () => {
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
      active: true,
    })

    const price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      slug: 'test-price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(pricingModel.id)
    expect(result[0].prices.length).toBeGreaterThan(0)

    const priceInResult = result[0].prices.find(
      (p) => p.id === price.id
    )
    expect(priceInResult?.id).toBe(price.id)
    expect(Object.keys(priceInResult!).sort()).toEqual([
      'active',
      'id',
      'slug',
      'type',
      'usageMeterId',
    ])
    expect(priceInResult!.slug).toBe('test-price')
    expect(priceInResult!.type).toBe(PriceType.Subscription)
    expect(priceInResult!.active).toBe(true)
  })

  it('should return only minimal usage meter fields (id, slug)', async () => {
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'test-usage-meter',
      name: 'Test Usage Meter',
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].usageMeters.length).toBeGreaterThan(0)

    const usageMeterInResult = result[0].usageMeters.find(
      (um) => um.id === usageMeter.id
    )
    expect(usageMeterInResult).toEqual({
      id: usageMeter.id,
      slug: 'test-usage-meter',
    })
  })

  it('should NOT fetch products or features', async () => {
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
      active: true,
    })

    const feature = await setupToggleFeature({
      organizationId: organization.id,
      name: 'Test Feature',
      livemode: false,
    })

    await setupProductFeature({
      productId: product.id,
      featureId: feature.id,
      organizationId: organization.id,
    })

    await setupPrice({
      productId: product.id,
      name: 'Test Price',
      slug: 'test-price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    // Verify result does not contain product or feature data
    expect(result[0]).not.toHaveProperty('products')
    expect(result[0]).not.toHaveProperty('features')
    // Only contains: id, organizationId, livemode, isDefault, prices, usageMeters
    expect(Object.keys(result[0]).sort()).toEqual([
      'id',
      'isDefault',
      'livemode',
      'organizationId',
      'prices',
      'usageMeters',
    ])
  })

  it('should filter by pricing model where conditions', async () => {
    const pricingModel2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Second Pricing Model',
      isDefault: false,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel2.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(pricingModel2.id)
    expect(result[0].id).not.toBe(pricingModel.id)
  })

  it('should de-duplicate usage meters from LEFT JOIN rows', async () => {
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'test-usage-meter-dedup',
      name: 'Test Usage Meter Dedup',
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    const usageMeterIds = result[0].usageMeters.map((um) => um.id)
    const uniqueUsageMeterIds = [...new Set(usageMeterIds)]
    expect(usageMeterIds.length).toBe(uniqueUsageMeterIds.length)
  })

  it('should only return prices from active products', async () => {
    const activeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Active Product',
      active: true,
    })

    const inactiveProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Inactive Product',
      active: false,
    })

    const activePrice = await setupPrice({
      productId: activeProduct.id,
      name: 'Active Product Price',
      slug: 'active-product-price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const inactiveProductPrice = await setupPrice({
      productId: inactiveProduct.id,
      name: 'Inactive Product Price',
      slug: 'inactive-product-price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    const priceIds = result[0].prices.map((p) => p.id)
    expect(priceIds).toContain(activePrice.id)
    expect(priceIds).not.toContain(inactiveProductPrice.id)
  })

  it('should de-duplicate prices by price ID', async () => {
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Product',
      active: true,
    })

    await setupPrice({
      productId: product.id,
      name: 'Test Price',
      slug: 'test-price-dedup',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      active: true,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: pricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    const priceIds = result[0].prices.map((p) => p.id)
    const uniquePriceIds = [...new Set(priceIds)]
    expect(priceIds.length).toBe(uniquePriceIds.length)
  })

  it('should handle pricing models with no prices or usage meters', async () => {
    const emptyPricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Empty Pricing Model',
      isDefault: false,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { id: emptyPricingModel.id },
        transaction
      )
    })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(emptyPricingModel.id)
    expect(result[0].prices).toEqual([])
    expect(result[0].usageMeters).toEqual([])
  })

  it('should handle multiple pricing models', async () => {
    const pricingModel2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Second Pricing Model',
      isDefault: false,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectPricingModelSlugResolutionData(
        { organizationId: organization.id },
        transaction
      )
    })

    expect(result.length).toBeGreaterThanOrEqual(2)
    const pricingModelIds = result.map((pm) => pm.id)
    expect(pricingModelIds).toContain(pricingModel.id)
    expect(pricingModelIds).toContain(pricingModel2.id)
  })
})
