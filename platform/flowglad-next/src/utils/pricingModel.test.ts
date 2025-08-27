import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  setupOrg,
  setupUserAndApiKey,
  setupPricingModel,
  setupToggleFeature,
} from '@/../seedDatabase'
import {
  clonePricingModelTransaction,
  createProductTransaction,
  editProduct,
} from './pricingModel'
import { IntervalUnit, PriceType, CurrencyCode } from '@/types'
import { selectPricingModelById } from '@/db/tableMethods/pricingModelMethods'
import {
  selectPricesAndProductsByProductWhere,
  insertPrice,
} from '@/db/tableMethods/priceMethods'
import { insertProduct } from '@/db/tableMethods/productMethods'
import { Product } from '@/db/schema/products'
import { nulledPriceColumns, Price } from '@/db/schema/prices'
import { Organization } from '@/db/schema/organizations'
import { PricingModel } from '@/db/schema/pricingModels'
import { Feature } from '@/db/schema/features'
import {
  insertFeature,
  selectFeatures,
} from '@/db/tableMethods/featureMethods'
import { selectProductFeatures } from '@/db/tableMethods/productFeatureMethods'
import { ApiKey } from '@/db/schema/apiKeys'
import core from './core'

describe('clonePricingModelTransaction', () => {
  let organization: Organization.Record
  let sourcePricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let features: Feature.Record[]
  let org1ApiKeyToken: string
  let userId: string

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    product = orgSetup.product
    price = orgSetup.price
    sourcePricingModel = orgSetup.pricingModel
    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: false,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token
    userId = userApiKeyOrg1.user.id
    const featureA = await setupToggleFeature({
      name: 'Feature A',
      organizationId: organization.id,
      livemode: false,
      pricingModelId: sourcePricingModel.id,
    })
    const featureB = await setupToggleFeature({
      name: 'Feature B',
      organizationId: organization.id,
      livemode: false,
      pricingModelId: sourcePricingModel.id,
    })
    features = [featureA, featureB]
  })

  describe('Basic Functionality', () => {
    it('should successfully clone a pricing model with all its products and prices', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned Pricing Model',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel).toBeDefined()
      expect(clonedPricingModel.products).toHaveLength(1)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
    })

    it('should create a new pricing model with the specified name', async () => {
      const newName = 'New PricingModel Name'
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: newName,
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.name).toBe(newName)
    })

    it('should set isDefault to false on the cloned pricing model', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.isDefault).toBe(false)
    })

    it('should preserve the livemode value from the source pricing model', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.livemode).toBe(
        sourcePricingModel.livemode
      )
    })

    it('should maintain the same organizationId as the source pricing model', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.organizationId).toBe(
        sourcePricingModel.organizationId
      )
    })
  })

  describe('PricingModel Scenarios', () => {
    it('should handle an empty pricing model (no products)', async () => {
      const emptyPricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Empty PricingModel',
      })

      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: emptyPricingModel.id,
              name: 'Cloned Empty PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.products).toHaveLength(0)
    })

    it('should handle a pricing model with multiple products correctly', async () => {
      // Create additional products in source pricing model
      const product2 = await adminTransaction(
        async ({ transaction }) => {
          return insertProduct(
            {
              name: 'Second Product',
              organizationId: organization.id,
              livemode: true,
              description: null,
              active: true,
              displayFeatures: null,
              singularQuantityLabel: null,
              pluralQuantityLabel: null,
              pricingModelId: sourcePricingModel.id,
              imageURL: null,
              externalId: null,
              default: false,
              slug: `flowglad-test-product-price+${core.nanoid()}`,
            },
            transaction
          )
        }
      )

      await adminTransaction(async ({ transaction }) => {
        return insertPrice(
          {
            ...nulledPriceColumns,
            productId: product2.id,
            name: 'Second Product Price',
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            livemode: true,
            active: true,
            isDefault: true,
            unitPrice: 2000,
            setupFeeAmount: 0,
            trialPeriodDays: 0,
            currency: CurrencyCode.USD,
            externalId: null,
            slug: `flowglad-test-product-price+${core.nanoid()}`,
          },
          transaction
        )
      })

      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned Multi-Product PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.products).toHaveLength(2)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
      expect(clonedPricingModel.products[1].prices).toHaveLength(1)
    })
  })

  describe('Product Cloning', () => {
    it('should clone all products from the source pricing model', async () => {
      const sourceProducts = await adminTransaction(
        async ({ transaction }) => {
          const productsWithPrices =
            await selectPricesAndProductsByProductWhere(
              {
                pricingModelId: sourcePricingModel.id,
              },
              transaction
            )
          return productsWithPrices
        }
      )

      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.products).toHaveLength(
        sourceProducts.length
      )
    })

    it('should assign new IDs to the cloned products', async () => {
      const sourceProductId = product.id
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      const clonedProductId = clonedPricingModel.products[0].id
      expect(clonedProductId).not.toBe(sourceProductId)
    })

    it('should preserve all product attributes except ID and pricingModelId', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      const sourceProduct = product
      const clonedProduct = clonedPricingModel.products[0]

      expect(clonedProduct.name).toBe(sourceProduct.name)
      expect(clonedProduct.description).toBe(
        sourceProduct.description
      )
      expect(clonedProduct.active).toBe(sourceProduct.active)
      expect(clonedProduct.displayFeatures).toEqual(
        sourceProduct.displayFeatures
      )
      expect(clonedProduct.singularQuantityLabel).toBe(
        sourceProduct.singularQuantityLabel
      )
      expect(clonedProduct.pluralQuantityLabel).toBe(
        sourceProduct.pluralQuantityLabel
      )
    })

    it('should correctly set the pricingModelId on cloned products to the new pricing model ID', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      expect(clonedPricingModel.products[0].pricingModelId).toBe(
        clonedPricingModel.id
      )
    })
  })

  describe('Price Cloning', () => {
    it('should clone all prices for each product', async () => {
      const sourcePrices = await adminTransaction(
        async ({ transaction }) => {
          const productsWithPrices =
            await selectPricesAndProductsByProductWhere(
              {
                pricingModelId: sourcePricingModel.id,
              },
              transaction
            )
          return productsWithPrices.flatMap(({ prices }) => prices)
        }
      )

      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      const clonedPrices = clonedPricingModel.products.flatMap(
        (product: any) => product.prices
      )
      expect(clonedPrices).toHaveLength(sourcePrices.length)
    })

    it('should assign new IDs to the cloned prices', async () => {
      const sourcePriceId = price.id
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      const clonedPriceId =
        clonedPricingModel.products[0].prices[0].id
      expect(clonedPriceId).not.toBe(sourcePriceId)
    })

    it('should preserve all price attributes except ID and productId', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      const sourcePrice = price
      const clonedPrice = clonedPricingModel.products[0].prices[0]

      expect(clonedPrice.name).toBe(sourcePrice.name)
      expect(clonedPrice.type).toBe(sourcePrice.type)
      expect(clonedPrice.intervalUnit).toBe(sourcePrice.intervalUnit)
      expect(clonedPrice.intervalCount).toBe(
        sourcePrice.intervalCount
      )
      expect(clonedPrice.unitPrice).toBe(sourcePrice.unitPrice)
      expect(clonedPrice.setupFeeAmount).toBe(
        sourcePrice.setupFeeAmount
      )
      expect(clonedPrice.trialPeriodDays).toBe(
        sourcePrice.trialPeriodDays
      )
      expect(clonedPrice.currency).toBe(sourcePrice.currency)
    })

    it('should associate prices with the correct new product IDs', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )

      const clonedProduct = clonedPricingModel.products[0]
      const clonedPrice = clonedProduct.prices[0]

      expect(clonedPrice.productId).toBe(clonedProduct.id)
    })
  })

  describe('Data Integrity', () => {
    it('should not modify the original pricing model, its products, or prices', async () => {
      const originalPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return selectPricingModelById(
            sourcePricingModel.id,
            transaction
          )
        }
      )

      const originalProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            {
              pricingModelId: sourcePricingModel.id,
            },
            transaction
          )
        }
      )

      await adminTransaction(async ({ transaction }) => {
        return clonePricingModelTransaction(
          {
            id: sourcePricingModel.id,
            name: 'Cloned PricingModel',
          },
          transaction
        )
      })

      const pricingModelAfterClone = await adminTransaction(
        async ({ transaction }) => {
          return selectPricingModelById(
            sourcePricingModel.id,
            transaction
          )
        }
      )

      const productsAfterClone = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            {
              pricingModelId: sourcePricingModel.id,
            },
            transaction
          )
        }
      )

      expect(pricingModelAfterClone).toEqual(originalPricingModel)
      expect(productsAfterClone).toEqual(originalProducts)
    })
  })

  describe('Transaction Handling', () => {
    it('should execute all operations within the provided transaction', async () => {
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            transaction
          )
        }
      )
      expect(clonedPricingModel).toBeDefined()
      const clonedProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedProducts).toHaveLength(1)
      //   expect(clonedPricingModel.products[0].prices).toHaveLength(1)
    })
  })
})

describe('createProductTransaction', () => {
  let organization: Organization.Record
  let sourcePricingModel: PricingModel.Record
  let org1ApiKeyToken: string
  let userId: string
  let features: Feature.Record[]
  let org1ApiKey: ApiKey.Record
  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    sourcePricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Test PricingModel',
      livemode: false,
    })

    const userApiKeyOrg1 = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKey = userApiKeyOrg1.apiKey
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token
    userId = userApiKeyOrg1.user.id
    const featureA = await setupToggleFeature({
      name: 'Feature A',
      organizationId: organization.id,
      livemode: false,
      pricingModelId: sourcePricingModel.id,
    })
    const featureB = await setupToggleFeature({
      name: 'Feature B',
      organizationId: organization.id,
      livemode: false,
      pricingModelId: sourcePricingModel.id,
    })
    features = [featureA, featureB]
  })
  it('should create a product with a default price', async () => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        return createProductTransaction(
          {
            product: {
              name: 'Test Product',
              description: 'Test Description',
              active: true,
              imageURL: null,
              displayFeatures: [],
              singularQuantityLabel: 'singular',
              pluralQuantityLabel: 'plural',
              pricingModelId: sourcePricingModel.id,
              default: false,
              slug: `flowglad-test-product-price+${core.nanoid()}`,
            },
            prices: [
              {
                name: 'Test Price',
                type: PriceType.Subscription,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                unitPrice: 1000,
                setupFeeAmount: 0,
                trialPeriodDays: 0,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
                startsWithCreditTrial: null,
                overagePriceId: null,
                slug: `flowglad-test-product-price+${core.nanoid()}`,
              },
            ],
          },
          {
            userId,
            transaction,
            livemode: org1ApiKey.livemode,
            organizationId: organization.id,
          }
        )
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )
    const { product, prices } = result
    const price = prices[0]
    expect(product.name).toBe('Test Product')
    expect(product.description).toBe('Test Description')
    expect(product.active).toBe(true)
    expect(product.imageURL).toBe(null)
    expect(product.displayFeatures).toEqual([])
    expect(product.singularQuantityLabel).toBe('singular')
    expect(product.pluralQuantityLabel).toBe('plural')
    expect(product.pricingModelId).toBe(sourcePricingModel.id)
    expect(prices).toHaveLength(1)
    expect(price.name).toBe('Test Price')
    expect(price.type).toBe(PriceType.Subscription)
    expect(price.intervalCount).toBe(1)
    expect(price.intervalUnit).toBe(IntervalUnit.Month)
    expect(price.unitPrice).toBe(1000)
    expect(price.setupFeeAmount).toBe(0)
    expect(price.trialPeriodDays).toBe(0)
    expect(price.currency).toBe(CurrencyCode.USD)
    expect(price.externalId).toBe(null)
    expect(price.usageMeterId).toBe(null)
    expect(price.isDefault).toBe(true)
    expect(price.active).toBe(true)
    expect(price.livemode).toBe(org1ApiKey.livemode)
  })

  it('should create a product and associate features with it', async () => {
    const featureIds = features.map((f) => f.id)
    const result = await authenticatedTransaction(
      async ({ transaction, livemode }) => {
        return createProductTransaction(
          {
            product: {
              name: 'Test Product with Features',
              description: 'Test Description',
              active: true,
              imageURL: null,
              displayFeatures: [],
              singularQuantityLabel: 'singular',
              pluralQuantityLabel: 'plural',
              pricingModelId: sourcePricingModel.id,
              default: false,
              slug: `flowglad-test-product-price+${core.nanoid()}`,
            },
            prices: [
              {
                name: 'Test Price',
                type: PriceType.Subscription,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                unitPrice: 1000,
                setupFeeAmount: 0,
                trialPeriodDays: 0,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
                startsWithCreditTrial: null,
                overagePriceId: null,
                slug: `flowglad-test-product-price+${core.nanoid()}`,
              },
            ],
            featureIds,
          },
          {
            userId,
            transaction,
            livemode: org1ApiKey.livemode,
            organizationId: organization.id,
          }
        )
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )

    const { product } = result
    const productFeatures = await adminTransaction(
      async ({ transaction }) => {
        return selectProductFeatures(
          { productId: product.id },
          transaction
        )
      }
    )

    expect(productFeatures).toHaveLength(2)
    expect(productFeatures.map((pf) => pf.featureId).sort()).toEqual(
      featureIds.sort()
    )
  })

  it('should create a product without features if featureIds is not provided', async () => {
    const result = await authenticatedTransaction(
      async ({ transaction, livemode }) => {
        return createProductTransaction(
          {
            product: {
              name: 'Test Product No Features',
              description: 'Test Description',
              active: true,
              imageURL: null,
              displayFeatures: [],
              singularQuantityLabel: 'singular',
              pluralQuantityLabel: 'plural',
              pricingModelId: sourcePricingModel.id,
              default: false,
              slug: `flowglad-test-product-price+${core.nanoid()}`,
            },
            prices: [
              {
                name: 'Test Price',
                type: PriceType.Subscription,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                unitPrice: 1000,
                setupFeeAmount: 0,
                trialPeriodDays: 0,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
                startsWithCreditTrial: null,
                overagePriceId: null,
                slug: `flowglad-test-product-price+${core.nanoid()}`,
              },
            ],
          },
          {
            userId,
            transaction,
            livemode: org1ApiKey.livemode,
            organizationId: organization.id,
          }
        )
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )

    const { product } = result
    const productFeatures = await adminTransaction(
      async ({ transaction }) => {
        return selectProductFeatures(
          { productId: product.id },
          transaction
        )
      }
    )

    expect(productFeatures).toHaveLength(0)
  })
})

describe('editProduct', () => {
  let organization: Organization.Record
  let product: Product.Record
  let features: Feature.Record[]

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    product = orgSetup.product

    const featureA = await setupToggleFeature({
      name: 'Feature A',
      organizationId: organization.id,
      livemode: true,
      pricingModelId: product.pricingModelId,
    })
    const featureB = await setupToggleFeature({
      name: 'Feature B',
      organizationId: organization.id,
      livemode: true,
      pricingModelId: product.pricingModelId,
    })
    const featureC = await setupToggleFeature({
      name: 'Feature C',
      organizationId: organization.id,
      livemode: true,
      pricingModelId: product.pricingModelId,
    })
    features = [featureA, featureB, featureC]
  })

  it('should add features to a product', async () => {
    const featureIds = [features[0].id, features[1].id]
    await adminTransaction(async ({ transaction }) => {
      return editProduct(
        {
          product: { id: product.id, name: 'Updated Product' },
          featureIds,
        },
        transaction
      )
    })

    const productFeatures = await adminTransaction(
      async ({ transaction }) => {
        return selectProductFeatures(
          { productId: product.id },
          transaction
        )
      }
    )

    expect(productFeatures).toHaveLength(2)
    expect(productFeatures.map((pf) => pf.featureId).sort()).toEqual(
      featureIds.sort()
    )
  })

  it('should remove features from a product', async () => {
    // First, add features
    await adminTransaction(async ({ transaction, livemode }) => {
      await editProduct(
        {
          product: { id: product.id },
          featureIds: [features[0].id, features[1].id],
        },
        transaction
      )
    })

    // Then, remove one
    await adminTransaction(async ({ transaction }) => {
      await editProduct(
        {
          product: { id: product.id },
          featureIds: [features[0].id],
        },
        transaction
      )
    })

    const productFeatures = await adminTransaction(
      async ({ transaction }) => {
        return selectProductFeatures(
          { productId: product.id },
          transaction
        )
      }
    )

    expect(
      productFeatures.filter((pf) => !pf.expiredAt)
    ).toHaveLength(1)
    expect(
      productFeatures.find((pf) => !pf.expiredAt)?.featureId
    ).toBe(features[0].id)
    expect(productFeatures.find((pf) => pf.expiredAt)).toBeDefined()
  })

  it('should not change features if featureIds is not provided', async () => {
    // First, add features
    await adminTransaction(async ({ transaction }) => {
      await editProduct(
        {
          product: { id: product.id },
          featureIds: [features[0].id, features[1].id],
        },
        transaction
      )
    })

    // Then, edit product without featureIds
    await adminTransaction(async ({ transaction }) => {
      await editProduct(
        {
          product: { id: product.id, name: 'New Name' },
        },
        transaction
      )
    })

    const productFeatures = await adminTransaction(
      async ({ transaction }) => {
        return selectProductFeatures(
          { productId: product.id },
          transaction
        )
      }
    )

    expect(
      productFeatures.filter((pf) => !pf.expiredAt)
    ).toHaveLength(2)
  })
})
