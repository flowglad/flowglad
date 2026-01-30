import { beforeEach, describe, expect, it } from 'bun:test'
import { CurrencyCode, IntervalUnit, PriceType } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import { Result } from 'better-result'
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
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { safelyUpdatePrice } from './priceMethods'
import {
  countProductsWithPricesByPricingModelIds,
  safelyInsertPricingModel,
  safelyUpdatePricingModel,
  selectPricingModelById,
  selectPricingModelForCustomer,
  selectPricingModelSlugResolutionData,
  selectPricingModels,
  selectPricingModelsTableRows,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from './pricingModelMethods'
import { selectProductsCursorPaginated } from './productMethods'

describe('safelyUpdatePricingModel', () => {
  let organization: Organization.Record
  let livemodePricingModel: PricingModel.Record // livemode default
  let testmodeDefaultPricingModel: PricingModel.Record // testmode default (from setupOrg)
  let testmodeNonDefaultPricingModel: PricingModel.Record // testmode not default

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    livemodePricingModel = orgData.pricingModel // livemode: true, isDefault: true

    // Get the testmode default pricing model that setupOrg created
    testmodeDefaultPricingModel = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const [pm] = await selectPricingModels(
          {
            organizationId: organization.id,
            livemode: false,
            isDefault: true,
          },
          transaction
        )
        return Result.ok(await pm!)
      })
    ).unwrap()

    testmodeNonDefaultPricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Non-Default PricingModel',
      isDefault: false,
      livemode: false, // Use testmode to avoid livemode uniqueness constraint
    })
  })

  it('should make a non-default pricingModel the new default, and unset the old default within the same livemode', async () => {
    // Make testmode non-default PM the new default
    ;(
      await adminTransactionWithResult(async (ctx) => {
        await safelyUpdatePricingModel(
          { id: testmodeNonDefaultPricingModel.id, isDefault: true },
          ctx
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    const updatedTestmodeDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              testmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    const updatedTestmodeNonDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              testmodeNonDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()

    // The non-default should now be default
    expect(updatedTestmodeNonDefault.isDefault).toBe(true)
    // The old default should no longer be default
    expect(updatedTestmodeDefault.isDefault).toBe(false)
  })

  it("should update a non-default pricingModel's properties without affecting the default status of other pricingModels", async () => {
    const newName = 'New PricingModel Name'
    const updatedPricingModel = (
      await adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyUpdatePricingModel(
            { id: testmodeNonDefaultPricingModel.id, name: newName },
            ctx
          )
        )
      })
    ).unwrap()

    const refreshedTestmodeDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              testmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()

    expect(updatedPricingModel.name).toBe(newName)
    expect(updatedPricingModel.isDefault).toBe(false)
    expect(refreshedTestmodeDefault.isDefault).toBe(true)
  })

  it('should allow unsetting a default pricingModel, leaving the organization with no default for that livemode', async () => {
    const updatedPricingModel = (
      await adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyUpdatePricingModel(
            { id: testmodeDefaultPricingModel.id, isDefault: false },
            ctx
          )
        )
      })
    ).unwrap()

    expect(updatedPricingModel.isDefault).toBe(false)
  })

  it('should update a property on a default pricingModel without changing its default status', async () => {
    const newName = 'New Name For Default PricingModel'
    const updatedPricingModel = (
      await adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyUpdatePricingModel(
            { id: livemodePricingModel.id, name: newName },
            ctx
          )
        )
      })
    ).unwrap()

    expect(updatedPricingModel.name).toBe(newName)
    expect(updatedPricingModel.isDefault).toBe(true)
  })

  it('should not affect the default pricingModel of another organization', async () => {
    // The beforeEach creates our primary organization and its pricingModels.
    // Now, set up a completely separate organization with its own default pricingModel.
    const otherOrgData = await setupOrg()
    const otherOrgDefaultPricingModel = otherOrgData
      .pricingModel(
        // Action: Make testmodeNonDefaultPricingModel the new default for the FIRST organization (testmode).
        await adminTransactionWithResult(async (ctx) => {
          await safelyUpdatePricingModel(
            {
              id: testmodeNonDefaultPricingModel.id,
              isDefault: true,
            },
            ctx
          )
          return Result.ok(undefined)
        })
      )
      .unwrap()

    // Expect: The default pricingModel for the second organization remains unchanged.
    const refreshedOtherOrgPricingModel = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              otherOrgDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    expect(refreshedOtherOrgPricingModel.isDefault).toBe(true)

    // Sanity check: The old testmode default for the first organization should now be false.
    const refreshedTestmodeDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              testmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    expect(refreshedTestmodeDefault.isDefault).toBe(false)
  })

  it('should not affect default pricingModels across livemode boundaries when updating', async () => {
    // Verify we have two default pricing models - one for each livemode
    expect(livemodePricingModel.isDefault).toBe(true)
    expect(livemodePricingModel.livemode).toBe(true)
    expect(testmodeDefaultPricingModel.isDefault).toBe(true)
    expect(testmodeDefaultPricingModel.livemode)
      .toBe(false)(
        // Make testmodeNonDefaultPricingModel the new default for testmode
        await adminTransactionWithResult(async (ctx) => {
          await safelyUpdatePricingModel(
            {
              id: testmodeNonDefaultPricingModel.id,
              isDefault: true,
            },
            ctx
          )
          return Result.ok(undefined)
        })
      )
      .unwrap()

    // Check that only the testmode default was affected
    const refreshedLivemodePricingModel = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              livemodePricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    const refreshedTestmodeNonDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              testmodeNonDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    const refreshedTestmodeDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              testmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()

    // testmodeNonDefaultPricingModel should now be the default for testmode
    expect(refreshedTestmodeNonDefault.isDefault).toBe(true)
    expect(refreshedTestmodeNonDefault.livemode).toBe(false)

    // Old testmode default should no longer be default
    expect(refreshedTestmodeDefault.isDefault).toBe(false)
    expect(refreshedTestmodeDefault.livemode).toBe(false)

    // Livemode default should remain unchanged
    expect(refreshedLivemodePricingModel.isDefault).toBe(true)
    expect(refreshedLivemodePricingModel.livemode).toBe(true)
  })
})

describe('safelyInsertPricingModel', () => {
  let organization: Organization.Record
  let existingLivemodeDefaultPricingModel: PricingModel.Record
  let existingTestmodeDefaultPricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    existingLivemodeDefaultPricingModel = orgData.pricingModel // livemode: true, isDefault: true

    // Get the testmode default pricing model that setupOrg created
    existingTestmodeDefaultPricingModel = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const [pm] = await selectPricingModels(
          {
            organizationId: organization.id,
            livemode: false,
            isDefault: true,
          },
          transaction
        )
        return Result.ok(await pm!)
      })
    ).unwrap()
  })

  it('should make the new pricingModel the default and unset the old default within the same livemode', async () => {
    // Insert a new testmode default PM (we use testmode since we can only have one livemode PM)
    const newPricingModel = (
      await adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyInsertPricingModel(
            {
              name: 'New Default PricingModel',
              organizationId: organization.id,
              isDefault: true,
              livemode: false, // Use testmode
            },
            ctx
          )
        )
      })
    ).unwrap()

    const refreshedOldDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              existingTestmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()

    expect(newPricingModel.isDefault).toBe(true)
    expect(refreshedOldDefault.isDefault).toBe(false)
  })

  it('should insert a non-default pricingModel without affecting the existing default', async () => {
    const newPricingModel = (
      await adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyInsertPricingModel(
            {
              name: 'New Non-Default PricingModel',
              organizationId: organization.id,
              isDefault: false,
              livemode: false, // Use testmode
            },
            ctx
          )
        )
      })
    ).unwrap()

    const refreshedOldDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              existingTestmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()

    expect(newPricingModel.isDefault).toBe(false)
    expect(refreshedOldDefault.isDefault).toBe(true)
  })

  it('should not affect the default pricingModel of another organization when inserting a new default', async () => {
    // Setup a second organization with its own default pricingModel
    const otherOrgData = await setupOrg()
    const otherOrgDefaultPricingModel = otherOrgData
      .pricingModel(
        // Insert a new default pricingModel for the FIRST organization (testmode)
        await adminTransactionWithResult(async (ctx) => {
          return Result.ok(
            await safelyInsertPricingModel(
              {
                name: 'New Default PricingModel for Org 1',
                organizationId: organization.id,
                isDefault: true,
                livemode: false, // Use testmode
              },
              ctx
            )
          )
        })
      )
      .unwrap()

    // Check that the second org's default pricingModel is untouched
    const refreshedOtherOrgPricingModel = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              otherOrgDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    expect(refreshedOtherOrgPricingModel.isDefault).toBe(true)
  })

  it('should not affect default pricingModels across livemode boundaries when inserting', async () => {
    // Verify we have two default pricing models - one for each livemode
    expect(existingLivemodeDefaultPricingModel.isDefault).toBe(true)
    expect(existingLivemodeDefaultPricingModel.livemode).toBe(true)
    expect(existingTestmodeDefaultPricingModel.isDefault).toBe(true)
    expect(existingTestmodeDefaultPricingModel.livemode).toBe(false)

    // Insert a new testmode default PM and verify it doesn't affect livemode default
    const newTestmodeDefault = (
      await adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyInsertPricingModel(
            {
              name: 'New Testmode Default PricingModel',
              organizationId: organization.id,
              isDefault: true,
              livemode: false,
            },
            ctx
          )
        )
      })
    ).unwrap()

    // Check that only the testmode default was affected
    const refreshedLivemodeDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              existingLivemodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()
    const refreshedOldTestmodeDefault = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await (
            await selectPricingModelById(
              existingTestmodeDefaultPricingModel.id,
              transaction
            )
          ).unwrap()
        )
      })
    ).unwrap()

    // New testmode pricing model should be default
    expect(newTestmodeDefault.isDefault).toBe(true)
    expect(newTestmodeDefault.livemode).toBe(false)

    // Old testmode default should no longer be default
    expect(refreshedOldTestmodeDefault.isDefault).toBe(false)
    expect(refreshedOldTestmodeDefault.livemode).toBe(false)

    // Livemode default should remain unchanged
    expect(refreshedLivemodeDefault.isDefault).toBe(true)
    expect(refreshedLivemodeDefault.livemode).toBe(true)
  })

  it('should reject inserting a second livemode pricing model with the expected error message', async () => {
    // setupOrg already creates a livemode pricing model (existingLivemodeDefaultPricingModel)
    // Attempting to insert another livemode PM should throw an error

    await expect(
      adminTransactionWithResult(async (ctx) => {
        return Result.ok(
          await safelyInsertPricingModel(
            {
              name: 'Second Livemode PricingModel',
              organizationId: organization.id,
              isDefault: false,
              livemode: true, // This should be rejected
            },
            ctx
          )
        )
      })
    ).rejects.toThrow(
      'Organization already has a livemode pricing model. Only one livemode pricing model is allowed per organization.'
    )
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
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    // Find the product without features
    const productResult = result[0].products.find(
      (p) => p.id === productWithoutFeatures.id
    )

    // Verify it has an empty features array, not null or undefined
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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(
            customerWithBadId,
            transaction
          )
        )
      })
    ).unwrap()

    // Should fallback to default pricing model
    expect(result.id).toBe(defaultPricingModel.id)
    expect(result.isDefault).toBe(true)

    // Should still filter inactive products
    expect(result.products.every((p) => p.active)).toBe(true)
  })

  it('should throw error when customer has invalid pricingModelId and no default pricing model exists', async () => {
    // Simulate a scenario where:
    // 1. The customer's pricingModelId doesn't match any existing pricing model
    // 2. There's no default pricing model for the (fake) organization
    const fakeOrgId = 'org_fake_no_default'
    const fakePricingModelId = 'pricing_model_nonexistent'

    const customer = await setupCustomer({
      organizationId: organization.id, // Use real org for customer creation
      email: 'nodefault@example.com',
    })

    // Override both organizationId and pricingModelId to simulate:
    // - pricingModelId pointing to non-existent pricing model (causes fallback to default lookup)
    // - organizationId pointing to org with no default pricing model (causes error)
    const customerWithFakeOrgAndPricingModel = {
      ...customer,
      organizationId: fakeOrgId,
      pricingModelId: fakePricingModelId,
    }

    await expect(
      adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(
            customerWithFakeOrgAndPricingModel,
            transaction
          )
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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

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
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(typeof productResult).toBe('object')
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
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(typeof productResult).toBe('object')
    expect(productResult?.features).toHaveLength(0) // All features expired
    expect(Array.isArray(productResult?.features)).toBe(true) // Should be empty array, not null
  })

  it('should handle products with no features assigned', async () => {
    // Don't assign any features to the product

    // Query the pricing model
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(typeof productResult).toBe('object')
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
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    // Verify the results
    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]
    const productResult = pricingModelResult.products.find(
      (p) => p.id === product.id
    )

    expect(typeof productResult).toBe('object')
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
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

    expect(result.products).toHaveLength(2) // setupOrg + our test product

    // Find our test product
    const testProduct = result.products.find(
      (p) => p.id === product.id
    )
    expect(typeof testProduct).toBe('object')
    expect(testProduct!.prices).toHaveLength(1) // Only the latest active price should remain

    const returnedPrices = testProduct!.prices

    // Verify only the latest active price is preserved
    expect(
      returnedPrices.find((p) => p.id === activePrice2.id)
    ).toMatchObject({ id: activePrice2.id })

    // Verify all returned prices are active
    returnedPrices.forEach((price) => {
      expect(price.active).toBe(true)
    })

    // Verify default price relationship
    const defaultPrice = returnedPrices.find((p) => p.isDefault)
    expect(defaultPrice).toMatchObject({ id: activePrice2.id })
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
    })(
      // setupPrice makes active=true and isDefault=true via safelyInsertPrice,
      // so we update both prices to be inactive and non-default
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: inactivePrice1.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
        await safelyUpdatePrice(
          {
            id: inactivePrice2.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'test-customer@example.com',
      pricingModelId: pricingModel.id,
    })

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

    expect(result.products).toHaveLength(2)

    // Find our test product
    const testProduct = result.products.find(
      (p) => p.id === product.id
    )
    expect(typeof testProduct).toBe('object')
    expect(testProduct!.prices).toHaveLength(1)

    const returnedPrices = testProduct!.prices
    expect(
      returnedPrices.find((p) => p.id === activePrice2.id)
    ).toMatchObject({ id: activePrice2.id })

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel2.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const priceFromInactiveProduct = await setupPrice({
      productId: inactiveProduct.id,
      name: 'Price from Inactive Product',
      slug: 'price-from-inactive-product',
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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    const priceIds = result[0].prices.map((p) => p.id)
    expect(priceIds).toContain(activePrice.id)
    expect(priceIds).not.toContain(priceFromInactiveProduct.id)
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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { id: emptyPricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

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

    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelSlugResolutionData(
            { organizationId: organization.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result.length).toBeGreaterThanOrEqual(2)
    const pricingModelIds = result.map((pm) => pm.id)
    expect(pricingModelIds).toContain(pricingModel.id)
    expect(pricingModelIds).toContain(pricingModel2.id)
  })
})

describe('Pricing Model Table Rows - Products Count Alignment', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
  })

  it('countProductsWithPricesByPricingModelIds counts products that have prices', async () => {
    // Create subscription products
    const subscriptionProduct1 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Subscription Product 1',
    })

    await setupPrice({
      productId: subscriptionProduct1.id,
      name: 'Subscription Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    const subscriptionProduct2 = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Subscription Product 2',
    })

    await setupPrice({
      productId: subscriptionProduct2.id,
      name: 'Subscription Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    // Create a usage meter (usage prices now belong to meters, not products)
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'API Calls Meter',
    })

    await setupPrice({
      name: 'Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
    })

    // Query the count
    const countMap = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await countProductsWithPricesByPricingModelIds(
            [pricingModel.id],
            transaction
          )
        )
      })
    ).unwrap()

    // Should count all products (subscription products + default product)
    // Usage prices no longer have products, so no products are excluded
    // Total: 2 subscription products + 1 default product = 3
    const count = countMap.get(pricingModel.id) ?? 0
    expect(count).toBe(3)
  })

  it('pricing model list count matches products grid total for a pricing model', async () => {
    const subscriptionProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Subscription Product',
    })

    await setupPrice({
      productId: subscriptionProduct.id,
      name: 'Subscription Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Usage Meter',
    })

    await setupPrice({
      usageMeterId: usageMeter.id,
      name: 'Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
    })

    await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Orphaned Product',
    })

    const pricingModelRows = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsTableRows({
            input: {
              filters: {
                id: pricingModel.id,
              },
            },
            transaction,
          })
        )
      })
    ).unwrap()

    const pricingModelRow = pricingModelRows.items.find(
      (row) => row.pricingModel.id === pricingModel.id
    )

    const productsGrid = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectProductsCursorPaginated({
            input: {
              filters: {
                pricingModelId: pricingModel.id,
                excludeProductsWithNoPrices: true,
              },
              pageSize: 50,
            },
            transaction,
          })
        )
      })
    ).unwrap()

    expect(pricingModelRow!.productsCount).toBe(productsGrid.total)
  })

  it('selectPricingModelsTableRows returns product count matching priced products', async () => {
    // Create subscription product
    const subscriptionProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Subscription Product',
    })

    await setupPrice({
      productId: subscriptionProduct.id,
      name: 'Subscription Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    // Create a usage meter (usage prices now belong to meters, not products)
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'API Calls Meter',
    })

    await setupPrice({
      name: 'Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
    })

    // Query pricing models table rows
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsTableRows({
            input: {
              filters: {
                id: pricingModel.id,
              },
            },
            transaction,
          })
        )
      })
    ).unwrap()

    // Find our pricing model
    const pricingModelRow = result.items.find(
      (row) => row.pricingModel.id === pricingModel.id
    )

    // Should count all products (subscription product + default product)
    // Usage prices no longer have products, so no products are excluded
    // Total: 1 subscription product + 1 default product = 2
    expect(pricingModelRow!.productsCount).toBe(2)
  })

  it('returns productsCount of 0 when pricing model has only usage meters (no products)', async () => {
    // Create a new pricing model
    const emptyPricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Usage Only Pricing Model',
      isDefault: false,
    })

    // Create a usage meter (usage prices now belong to meters, not products)
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: emptyPricingModel.id,
      name: 'API Calls Meter 2',
    })

    await setupPrice({
      name: 'Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
    })

    // Query pricing models table rows
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsTableRows({
            input: {
              filters: {
                id: emptyPricingModel.id,
              },
            },
            transaction,
          })
        )
      })
    ).unwrap()

    // Find our pricing model
    const pricingModelRow = result.items.find(
      (row) => row.pricingModel.id === emptyPricingModel.id
    )

    // Should be 0 since setupPricingModel doesn't create a default product,
    // and we only created usage meters (which don't have products)
    expect(pricingModelRow!.productsCount).toBe(0)
  })
})

describe('Inactive Product and Price Filtering at SQL Level', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
  })

  it('selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere excludes inactive products at the SQL level', async () => {
    // Create an active product with an active price
    const activeProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Active Product',
      active: true,
    })

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

    // Create an inactive product with an active price
    const inactiveProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Inactive Product',
      active: false,
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

    // Query using the base function (not via selectPricingModelForCustomer)
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]

    // Verify inactive product is excluded
    const productIds = pricingModelResult.products.map((p) => p.id)
    expect(productIds).toContain(activeProduct.id)
    expect(productIds).not.toContain(inactiveProduct.id)

    // Verify all returned products are active
    expect(pricingModelResult.products.every((p) => p.active)).toBe(
      true
    )
  })

  it('selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere excludes inactive prices at the SQL level', async () => {
    // Create an active product
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product with Mixed Prices',
      active: true,
    })

    // Note: safelyInsertPrice (used by setupPrice) sets existing prices to inactive
    // when creating a new price for the same product. So:
    // - After creating price1: price1 is active=true
    // - After creating price2: price1 becomes active=false, price2 is active=true
    const price1 = await setupPrice({
      productId: product.id,
      name: 'Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    const price2 = await setupPrice({
      productId: product.id,
      name: 'Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      trialPeriodDays: 0,
    })

    // At this point: price1 is inactive (due to safelyInsertPrice behavior), price2 is active

    // Query using the base function (not via selectPricingModelForCustomer)
    const result = (
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]

    // Find our test product
    const testProduct = pricingModelResult.products.find(
      (p) => p.id === product.id
    )
    expect(testProduct?.id).toBe(product.id)

    // Verify inactive price (price1) is excluded and active price (price2) is included
    const priceIds = testProduct!.prices.map((p) => p.id)
    expect(priceIds).not.toContain(price1.id) // price1 was made inactive when price2 was created
    expect(priceIds).toContain(price2.id) // price2 is the active price

    // Verify all returned prices are active
    expect(testProduct!.prices.every((p) => p.active)).toBe(true)
  })

  it('selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere excludes products with only inactive prices', async () => {
    // Create an active product with ONLY inactive prices
    const productWithOnlyInactivePrices = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Product with Only Inactive Prices',
      active: true,
    })

    const inactivePrice1 = await setupPrice({
      productId: productWithOnlyInactivePrices.id,
      name: 'Inactive Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
    })

    const inactivePrice2 = await setupPrice({
      productId: productWithOnlyInactivePrices.id,
      name: 'Inactive Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      trialPeriodDays: 0,
    })(
      // Deactivate both prices
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: inactivePrice1.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
        await safelyUpdatePrice(
          {
            id: inactivePrice2.id,
            type: PriceType.Subscription,
            active: false,
            isDefault: false,
          },
          ctx
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    // Query using the base function
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]

    // Verify the product with only inactive prices is excluded
    // (because the INNER JOIN on active prices means it won't appear)
    const productIds = pricingModelResult.products.map((p) => p.id)
    expect(productIds).not.toContain(productWithOnlyInactivePrices.id)
  })

  it('selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere excludes inactive usage prices at the SQL level', async () => {
    // Create a usage meter
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Test Usage Meter',
    })

    // Create two usage prices (both active initially via setupPrice)
    const usagePrice1 = await setupPrice({
      name: 'Usage Price 1',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
    })

    const usagePrice2 = await setupPrice({
      name: 'Usage Price 2',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 5,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })(
      // Deactivate usagePrice2 via safelyUpdatePrice (since setupPrice doesn't respect active: false)
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: usagePrice2.id,
            type: PriceType.Usage,
            active: false,
            isDefault: false,
          },
          ctx
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    // Query using the base function
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]

    // Find our usage meter
    const testUsageMeter = pricingModelResult.usageMeters.find(
      (m) => m.id === usageMeter.id
    )
    expect(testUsageMeter?.id).toBe(usageMeter.id)

    // Verify inactive usage price is excluded and active one is included
    const usagePriceIds = testUsageMeter!.prices.map((p) => p.id)
    expect(usagePriceIds).toContain(usagePrice1.id)
    expect(usagePriceIds).not.toContain(usagePrice2.id)

    // Verify all returned usage prices are active
    expect(testUsageMeter!.prices.every((p) => p.active)).toBe(true)
  })
})

describe('Usage Meter Prices in Pricing Model Response', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
  })

  it('selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere returns usage meters with their prices attached', async () => {
    // Create a usage meter
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'API Calls Meter',
    })

    // Create a usage price for the meter
    const usagePrice = await setupPrice({
      name: 'Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
    })

    // Query the pricing model
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    expect(result).toHaveLength(1)
    const pricingModelResult = result[0]

    // Find our usage meter
    const usageMeterResult = pricingModelResult.usageMeters.find(
      (m) => m.id === usageMeter.id
    )

    expect(usageMeterResult?.id).toBe(usageMeter.id)
    expect(usageMeterResult!.prices).toHaveLength(1)
    expect(usageMeterResult!.prices[0].id).toBe(usagePrice.id)
    expect(usageMeterResult!.prices[0].type).toBe(PriceType.Usage)
    expect(usageMeterResult!.prices[0].unitPrice).toBe(10)
    expect(usageMeterResult!.defaultPrice?.id).toBe(usagePrice.id)
  })

  it('returns usage meters with multiple prices correctly grouped', async () => {
    // Create a usage meter
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Video Minutes Meter',
    })

    // Create multiple usage prices for the same meter
    // Note: safelyInsertPrice sets isDefault: false for all usage prices,
    // so the fallback behavior (first price = default) applies
    const usagePrice1 = await setupPrice({
      name: 'Standard Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 5,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })

    const usagePrice2 = await setupPrice({
      name: 'Premium Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 10,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
    })

    // Query the pricing model
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    const pricingModelResult = result[0]
    const usageMeterResult = pricingModelResult.usageMeters.find(
      (m) => m.id === usageMeter.id
    )

    expect(usageMeterResult!.prices).toHaveLength(2)
    expect(usageMeterResult!.prices.map((p) => p.id)).toContain(
      usagePrice1.id
    )
    expect(usageMeterResult!.prices.map((p) => p.id)).toContain(
      usagePrice2.id
    )
    // Since usage prices don't have isDefault set, one of them becomes the default
    // (the specific choice depends on query ordering which is non-deterministic)
    expect([usagePrice1.id, usagePrice2.id]).toContain(
      usageMeterResult!.defaultPrice!.id
    )
  })

  it('selectPricingModelForCustomer filters inactive usage prices from usage meters', async () => {
    // Create a usage meter
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Storage Meter',
    })

    // Create an active usage price
    const activeUsagePrice = await setupPrice({
      name: 'Active Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 20,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      usageMeterId: usageMeter.id,
      active: true,
    })

    // Create an inactive usage price
    const inactiveUsagePrice = await setupPrice({
      name: 'Inactive Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 15,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      usageMeterId: usageMeter.id,
      active: false,
    })(
      // Deactivate the inactive price
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        await safelyUpdatePrice(
          {
            id: inactiveUsagePrice.id,
            type: PriceType.Usage,
            active: false,
            isDefault: false,
          },
          ctx
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    // Create a customer
    const customer = await setupCustomer({
      organizationId: organization.id,
      email: 'usage-test@example.com',
      pricingModelId: pricingModel.id,
    })

    // Query via selectPricingModelForCustomer (which applies active filtering)
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelForCustomer(customer, transaction)
        )
      })
    ).unwrap()

    // Find our usage meter
    const usageMeterResult = result.usageMeters.find(
      (m) => m.id === usageMeter.id
    )

    expect(usageMeterResult?.id).toBe(usageMeter.id)
    // Should only contain the active price
    expect(usageMeterResult!.prices).toHaveLength(1)
    expect(usageMeterResult!.prices[0].id).toBe(activeUsagePrice.id)
    expect(usageMeterResult!.prices[0].active).toBe(true)
    expect(usageMeterResult!.defaultPrice?.id).toBe(
      activeUsagePrice.id
    )
  })

  it('returns usage meters with empty prices array when no prices exist', async () => {
    // Create a usage meter without any prices
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Empty Meter',
    })

    // Query the pricing model
    const result = (
      await adminTransactionWithResult(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
            { id: pricingModel.id },
            transaction
          )
        )
      })
    ).unwrap()

    const pricingModelResult = result[0]
    const usageMeterResult = pricingModelResult.usageMeters.find(
      (m) => m.id === usageMeter.id
    )

    expect(usageMeterResult?.id).toBe(usageMeter.id)
    expect(Array.isArray(usageMeterResult!.prices)).toBe(true)
    expect(usageMeterResult!.prices).toHaveLength(0)
    expect(usageMeterResult!.defaultPrice).toBeUndefined()
  })
})
