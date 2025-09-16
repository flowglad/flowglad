import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  getProductTableRows,
  insertProduct,
  updateProduct,
  selectProductPriceAndFeaturesByProductId,
} from './productMethods'
import { insertUser } from './userMethods'
import {
  setupOrg,
  setupPricingModel,
  setupMemberships,
  setupProduct,
  setupPrice,
} from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import core from '@/utils/core'
import { Product } from '@/db/schema/products'

describe('getProductTableRows', () => {
  let organizationId: string
  let userId: string
  let secondProductId: string
  let thirdProductId: string
  let secondPriceId: string
  let thirdPriceId: string
  let pricingModelId: string

  beforeEach(async () => {
    // Set up organization
    const { organization } = await setupOrg()
    organizationId = organization.id

    const membership = await setupMemberships({ organizationId })
    userId = membership.userId

    // Set up pricingModel
    const pricingModel = await setupPricingModel({
      organizationId,
      name: 'Test PricingModel',
    })
    pricingModelId = pricingModel.id

    // Set up products
    const secondProduct = await setupProduct({
      organizationId,
      name: 'Product 1',
      pricingModelId,
    })
    secondProductId = secondProduct.id

    const thirdProduct = await setupProduct({
      organizationId,
      name: 'Product 2',
      pricingModelId,
    })
    thirdProductId = thirdProduct.id

    // Set up prices
    const secondPrice = await setupPrice({
      productId: secondProductId,
      name: 'Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })
    secondPriceId = secondPrice.id

    const thirdPrice = await setupPrice({
      productId: thirdProductId,
      name: 'Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })
    thirdPriceId = thirdPrice.id
  })

  it("should return products with prices and pricingModels for the user's organization, sorted by creation date descending", async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    expect(result.data.length).toBe(3)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)

    // Check first product
    expect(result.data[1].product.id).toBe(secondProductId)
    expect(result.data[1].product.name).toBe('Product 1')
    expect(result.data[1].product.active).toBe(true)
    expect(result.data[1].prices.length).toBe(1)
    expect(result.data[1].prices[0].id).toBe(secondPriceId)
    expect(result.data[1].pricingModel?.id).toBe(pricingModelId)

    // Check second product
    expect(result.data[0].product.id).toBe(thirdProductId)
    expect(result.data[0].product.name).toBe('Product 2')
    expect(result.data[0].product.active).toBe(true)
    expect(result.data[0].prices.length).toBe(1)
    expect(result.data[0].prices[0].id).toBe(thirdPriceId)
    expect(result.data[0].pricingModel?.id).toBe(pricingModelId)
  })

  it('should filter products by active status', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
          filters: {
            active: true,
          },
        },
        transaction,
        userId
      )
    })

    expect(result.data.length).toBe(3)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)
    expect(result.data[1].product.id).toBe(secondProductId)
    expect(result.data[0].product.active).toBe(true)
  })

  it('should filter products by organization ID', async () => {
    // Create another organization
    const { organization: otherOrg } = await setupOrg()
    const otherUser = await adminTransaction(
      async ({ transaction }) => {
        return insertUser(
          {
            id: `other-user-id-${core.nanoid()}`,
            email: 'other@example.com',
            name: 'Other User',
          },
          transaction
        )
      }
    )
    await setupMemberships({ organizationId: otherOrg.id })

    // Create a product in the other organization
    const otherPricingModel = await setupPricingModel({
      organizationId: otherOrg.id,
      name: 'Other PricingModel',
    })
    const otherProduct = await setupProduct({
      organizationId: otherOrg.id,
      name: 'Other Product',
      pricingModelId: otherPricingModel.id,
    })
    await setupPrice({
      productId: otherProduct.id,
      name: 'Other Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    // Get products for the original user
    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    // Should only return products from the original organization
    expect(result.data.length).toBe(3)
    expect(result.total).toBe(3)
    expect(
      result.data.every(
        (p) => p.product.organizationId === organizationId
      )
    ).toBe(true)
  })

  it('should apply pagination correctly', async () => {
    // Create additional products to test pagination
    for (let i = 3; i <= 12; i++) {
      const product = await setupProduct({
        organizationId,
        name: `Product ${i}`,
        pricingModelId,
      })
      await setupPrice({
        productId: product.id,
        name: `Price ${i}`,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        unitPrice: 1000 * i,
        currency: CurrencyCode.USD,
        livemode: true,
        isDefault: true,
        setupFeeAmount: 0,
        trialPeriodDays: 0,
        externalId: undefined,
        usageMeterId: undefined,
      })
    }

    // First page
    const result1 = await adminTransaction(
      async ({ transaction }) => {
        return getProductTableRows(
          {
            cursor: '0',
            limit: 5,
          },
          transaction,
          userId
        )
      }
    )

    expect(result1.data.length).toBe(5)
    expect(result1.total).toBe(13)
    expect(result1.hasMore).toBe(true)

    // Second page
    const result2 = await adminTransaction(
      async ({ transaction }) => {
        return getProductTableRows(
          {
            cursor: '1',
            limit: 5,
          },
          transaction,
          userId
        )
      }
    )

    expect(result2.data.length).toBe(5)
    expect(result2.total).toBe(13)
    expect(result2.hasMore).toBe(true)

    // Third page
    const result3 = await adminTransaction(
      async ({ transaction }) => {
        return getProductTableRows(
          {
            cursor: '2',
            limit: 5,
          },
          transaction,
          userId
        )
      }
    )

    expect(result3.data.length).toBe(3)
    expect(result3.total).toBe(13)
    expect(result3.hasMore).toBe(false)
  })

  it('should handle products with multiple prices', async () => {
    // Add another price to the first product
    await setupPrice({
      productId: secondProductId,
      name: 'Price 1B',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    expect(result.data.length).toBe(3)

    // Check that the first product has two prices
    const secondProduct = result.data.find(
      (p) => p.product.id === secondProductId
    )
    expect(secondProduct?.prices.length).toBe(2)
  })

  it('should sort products by creation date in descending order', async () => {
    // Create a new product that should appear first
    const newProduct = await setupProduct({
      organizationId,
      name: 'New Product',
      pricingModelId,
    })
    await setupPrice({
      productId: newProduct.id,
      name: 'New Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 2000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return getProductTableRows(
        {
          cursor: '0',
          limit: 10,
        },
        transaction,
        userId
      )
    })

    // The newest product should be first
    expect(result.data[0].product.id).toBe(newProduct.id)
  })
})

describe('Database Constraints', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id

    const pricingModel = await setupPricingModel({ organizationId })
    pricingModelId = pricingModel.id

    const defaultProduct = await setupProduct({
      organizationId,
      name: 'Default Product',
      pricingModelId,
      default: true,
    })
    defaultProductId = defaultProduct.id
  })

  it('throws an error when inserting a second default product for the same pricingModel', async () => {
    const newProductInsert: Product.Insert = {
      name: 'Another Default Product',
      organizationId,
      pricingModelId,
      livemode: true,
      active: true,
      default: true,
      displayFeatures: [],
      singularQuantityLabel: 'seat',
      pluralQuantityLabel: 'seats',
      externalId: null,
      description: null,
      imageURL: null,
      slug: `another-default-product+${core.nanoid()}`,
    }

    await expect(
      adminTransaction(async ({ transaction }) => {
        await insertProduct(newProductInsert, transaction)
      })
    ).rejects.toThrow(/Failed query:/)
  })

  it('throws an error when updating a product to be default when another default product exists', async () => {
    const nonDefaultProduct = await setupProduct({
      organizationId,
      name: 'Non-Default Product',
      pricingModelId,
      default: false,
    })

    await expect(
      adminTransaction(async ({ transaction }) => {
        await updateProduct(
          {
            id: nonDefaultProduct.id,
            default: true,
          },
          transaction
        )
      })
    ).rejects.toThrow(/Failed query:/)
  })

  it('allows inserting a non-default product when a default product already exists', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonDefaultProduct = await insertProduct(
        {
          name: 'Non-Default Product',
          organizationId,
          pricingModelId,
          livemode: true,
          active: true,
          default: false,
          displayFeatures: [],
          singularQuantityLabel: 'seat',
          pluralQuantityLabel: 'seats',
          externalId: null,
          description: null,
          imageURL: null,
          slug: `non-default-product+${core.nanoid()}`,
        },
        transaction
      )
      expect(nonDefaultProduct.default).toBe(false)
    })
  })

  it('allows multiple default products in different pricingModels', async () => {
    await adminTransaction(async ({ transaction }) => {
      // First default product is already created in the first pricingModel
      // Create a second pricingModel
      const secondPricingModel = await setupPricingModel({
        organizationId,
      })

      // Create a default product in the second pricing model
      const secondDefaultProduct = await insertProduct(
        {
          name: 'Default Product in Second PricingModel',
          organizationId,
          pricingModelId: secondPricingModel.id,
          livemode: true,
          active: true,
          default: true,
          displayFeatures: [],
          singularQuantityLabel: 'seat',
          pluralQuantityLabel: 'seats',
          externalId: null,
          description: null,
          imageURL: null,
          slug: `default-product-in-second-pricingModel+${core.nanoid()}`,
        },
        transaction
      )

      expect(secondDefaultProduct.default).toBe(true)
      expect(secondDefaultProduct.pricingModelId).toBe(
        secondPricingModel.id
      )
    })
  })
})

// Slug uniqueness tests using trigger enforcement
describe('Slug uniqueness policies', () => {
  let organizationId: string
  let pricingModelId: string
  beforeEach(async () => {
    const setup = await setupOrg()
    organizationId = setup.organization.id
    pricingModelId = setup.pricingModel.id
  })
  it('throws an error when inserting a product with duplicate slug in the same pricingModel', async () => {
    const slug = 'duplicate-slug'
    await expect(
      adminTransaction(async ({ transaction }) => {
        // Insert first product with slug
        await insertProduct(
          {
            name: 'First Product',
            organizationId,
            pricingModelId,
            livemode: true,
            active: true,
            default: false,
            displayFeatures: [],
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: null,
            description: null,
            imageURL: null,
            slug,
          },
          transaction
        )
        // Attempt to insert second product with same slug
        await insertProduct(
          {
            name: 'Second Product',
            organizationId,
            pricingModelId,
            livemode: true,
            active: true,
            default: false,
            displayFeatures: [],
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: null,
            description: null,
            imageURL: null,
            slug,
          },
          transaction
        )
      })
    ).rejects.toThrow(/Failed query:/)
  })
  it('throws an error when updating a product slug to one that already exists in the same pricingModel', async () => {
    const slug1 = 'slug-one'
    const slug2 = 'slug-two'
    await expect(
      adminTransaction(async ({ transaction }) => {
        // Insert first product with slug1
        const firstProduct = await insertProduct(
          {
            name: 'First Product',
            organizationId,
            pricingModelId,
            livemode: true,
            active: true,
            default: false,
            displayFeatures: [],
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: null,
            description: null,
            imageURL: null,
            slug: slug1,
          },
          transaction
        )
        // Insert second product with slug2
        const secondProduct = await insertProduct(
          {
            name: 'Second Product',
            organizationId,
            pricingModelId,
            livemode: true,
            active: true,
            default: false,
            displayFeatures: [],
            singularQuantityLabel: 'unit',
            pluralQuantityLabel: 'units',
            externalId: null,
            description: null,
            imageURL: null,
            slug: slug2,
          },
          transaction
        )
        // Attempt to update second product to slug1
        await updateProduct(
          { id: secondProduct.id, slug: slug1 },
          transaction
        )
      })
    ).rejects.toThrow(/Failed query:/)
  })
})

describe('selectProductPriceAndFeaturesByProductId', () => {
  it('should return product with prices and features', async () => {
    // Set up organization and product
    const { organization } = await setupOrg()
    const pricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Test PricingModel',
    })
    const product = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      pricingModelId: pricingModel.id,
    })

    // Set up prices
    await setupPrice({
      productId: product.id,
      name: 'Price 1',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    await setupPrice({
      productId: product.id,
      name: 'Price 2',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Year,
      intervalCount: 1,
      unitPrice: 10000,
      currency: CurrencyCode.USD,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      externalId: undefined,
      usageMeterId: undefined,
    })

    // Get product with prices and features
    const result = await adminTransaction(async ({ transaction }) => {
      return selectProductPriceAndFeaturesByProductId(
        product.id,
        transaction
      )
    })

    // Verify the result
    expect(result.product.id).toBe(product.id)
    expect(result.product.name).toBe('Test Product')
    expect(result.prices).toHaveLength(2)
    expect(result.prices[0].name).toBe('Price 1')
    expect(result.prices[1].name).toBe('Price 2')
    expect(result.features).toBeDefined()
    expect(Array.isArray(result.features)).toBe(true)
  })
})
