import { describe, it, expect, beforeEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  setupOrg,
  setupUserAndApiKey,
  setupPricingModel,
  setupToggleFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
  setupProduct,
  setupPrice,
  setupProductFeature,
} from '@/../seedDatabase'
import {
  clonePricingModelTransaction,
  createProductTransaction,
  editProduct,
} from './pricingModel'
import {
  IntervalUnit,
  PriceType,
  CurrencyCode,
  FeatureType,
  FeatureUsageGrantFrequency,
  DestinationEnvironment,
} from '@/types'
import { core } from '@/utils/core'
import {
  selectPricingModelById,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { selectPricesAndProductsByProductWhere } from '@/db/tableMethods/priceMethods'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Organization } from '@/db/schema/organizations'
import { PricingModel } from '@/db/schema/pricingModels'
import { Feature } from '@/db/schema/features'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectProductFeatures } from '@/db/tableMethods/productFeatureMethods'
import { ApiKey } from '@/db/schema/apiKeys'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import { UsageMeter } from '@/db/schema/usageMeters'
import { ProductFeature } from '@/db/schema/productFeatures'
import { productFeatures } from '@/db/schema/productFeatures'
import { eq } from 'drizzle-orm'

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
      const product2 = await setupProduct({
        name: 'Second Product',
        organizationId: organization.id,
        livemode: true,
        pricingModelId: sourcePricingModel.id,
        active: true,
      })

      await setupPrice({
        productId: product2.id,
        name: 'Second Product Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        unitPrice: 2000,
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

  describe('Usage Meters Cloning', () => {
    it('should clone usage meters with preserved slugs', async () => {
      // Create usage meters for the source pricing model
      const usageMeter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'API Calls',
        slug: 'api-calls',
        livemode: false,
      })

      const usageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Storage GB',
        slug: 'storage-gb',
        livemode: false,
      })

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Usage Meters',
            },
            transaction
          )
        }
      )

      // Verify usage meters were cloned
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      expect(clonedUsageMeters).toHaveLength(2)
      expect(clonedUsageMeters.map((m) => m.slug).sort()).toEqual([
        'api-calls',
        'storage-gb',
      ])
      expect(clonedUsageMeters.map((m) => m.name).sort()).toEqual([
        'API Calls',
        'Storage GB',
      ])
      // Verify new IDs were assigned
      expect(
        clonedUsageMeters.every(
          (m) => m.id !== usageMeter1.id && m.id !== usageMeter2.id
        )
      ).toBe(true)
      // Verify correct pricing model association
      expect(
        clonedUsageMeters.every(
          (m) => m.pricingModelId === clonedPricingModel.id
        )
      ).toBe(true)
    })

    it('should handle pricing model with no usage meters', async () => {
      // Clone pricing model without any usage meters
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned without Usage Meters',
            },
            transaction
          )
        }
      )

      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      expect(clonedUsageMeters).toHaveLength(0)
    })
  })

  describe('Features Cloning', () => {
    it('should clone features with preserved slugs', async () => {
      // Create different types of features
      const toggleFeature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Premium Support',
        slug: 'premium-support',
        description: 'Access to premium support',
        livemode: false,
      })

      // Create a usage meter for the usage credit grant feature
      const apiRequestsMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'API Requests Meter',
        slug: 'api-requests-meter',
        livemode: false,
      })

      const usageFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'API Requests',
        slug: 'api-requests',
        description: 'Number of API requests',
        amount: 1000,
        usageMeterId: apiRequestsMeter.id,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: false,
      })

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Features',
            },
            transaction
          )
        }
      )

      // Verify features were cloned
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      expect(clonedFeatures).toHaveLength(4) // 2 from beforeEach + 2 new ones
      const newFeatures = clonedFeatures.filter(
        (f) =>
          f.slug === 'premium-support' || f.slug === 'api-requests'
      )
      expect(newFeatures).toHaveLength(2)

      // Check toggle feature
      const clonedToggle = newFeatures.find(
        (f) => f.slug === 'premium-support'
      )
      expect(clonedToggle).toBeDefined()
      expect(clonedToggle?.type).toBe(FeatureType.Toggle)
      expect(clonedToggle?.name).toBe('Premium Support')
      expect(clonedToggle?.id).not.toBe(toggleFeature.id)

      // Check usage feature with all attributes
      const clonedUsage = newFeatures.find(
        (f) => f.slug === 'api-requests'
      )
      expect(clonedUsage).toBeDefined()
      expect(clonedUsage?.type).toBe(FeatureType.UsageCreditGrant)
      expect(clonedUsage?.amount).toBe(1000)
      expect(clonedUsage?.renewalFrequency).toBe(
        FeatureUsageGrantFrequency.EveryBillingPeriod
      )
      expect(clonedUsage?.id).not.toBe(usageFeature.id)

      // Verify correct pricing model association
      expect(
        clonedFeatures.every(
          (f) => f.pricingModelId === clonedPricingModel.id
        )
      ).toBe(true)

      // Verify usage meter was also cloned
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].slug).toBe('api-requests-meter')
    })

    it('should handle features with usage meter dependencies', async () => {
      // Create a usage meter first
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Data Transfer',
        slug: 'data-transfer',
        livemode: false,
      })

      // Create a feature that references the usage meter
      const featureWithMeter = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Bandwidth Usage',
        slug: 'bandwidth-usage',
        description: 'Monthly bandwidth allowance',
        amount: 5000,
        usageMeterId: usageMeter.id,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: false,
      })

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Meter Dependencies',
            },
            transaction
          )
        }
      )

      // Get cloned usage meter
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      const clonedMeter = clonedUsageMeters.find(
        (m) => m.slug === 'data-transfer'
      )
      expect(clonedMeter).toBeDefined()

      // Get cloned features
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      const clonedFeature = clonedFeatures.find(
        (f) => f.slug === 'bandwidth-usage'
      )
      expect(clonedFeature).toBeDefined()

      // Verify that usageMeterId is correctly remapped to the new usage meter
      expect(clonedFeature?.usageMeterId).not.toBe(usageMeter.id)
      expect(clonedFeature?.usageMeterId).toBe(clonedMeter?.id)

      // Verify that the cloned feature grants the same credits to the corresponding meter as the original
      expect(clonedFeature?.amount).toBe(featureWithMeter.amount)
      expect(clonedFeature?.amount).toBe(5000)
      expect(clonedFeature?.renewalFrequency).toBe(
        featureWithMeter.renewalFrequency
      )
      expect(clonedFeature?.renewalFrequency).toBe(
        FeatureUsageGrantFrequency.EveryBillingPeriod
      )

      // Verify all other feature attributes are preserved
      expect(clonedFeature?.name).toBe(featureWithMeter.name)
      expect(clonedFeature?.description).toBe(
        featureWithMeter.description
      )
      expect(clonedFeature?.type).toBe(featureWithMeter.type)
      expect(clonedFeature?.active).toBe(featureWithMeter.active)
    })
  })

  describe('Product Features Cloning', () => {
    it('should clone product features associations', async () => {
      // Associate features with the product
      const productFeature1 = await setupProductFeature({
        productId: product.id,
        featureId: features[0].id,
        organizationId: organization.id,
        livemode: false,
      })

      const productFeature2 = await setupProductFeature({
        productId: product.id,
        featureId: features[1].id,
        organizationId: organization.id,
        livemode: false,
      })

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Product Features',
            },
            transaction
          )
        }
      )

      // Get cloned product
      const clonedProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedProducts).toHaveLength(1)
      const clonedProduct = clonedProducts[0]

      // Get cloned features
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      // Get product features for cloned product
      const clonedProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: clonedProduct.id },
            transaction
          )
        }
      )

      expect(clonedProductFeatures).toHaveLength(2)

      // Verify the associations point to the new IDs
      expect(
        clonedProductFeatures.every(
          (pf) => pf.productId === clonedProduct.id
        )
      ).toBe(true)

      // Map original feature slugs to verify correct associations
      const originalFeatureSlugs = features
        .slice(0, 2)
        .map((f) => f.slug)
        .sort()
      const clonedFeatureIds = clonedProductFeatures.map(
        (pf) => pf.featureId
      )
      const associatedFeatures = clonedFeatures.filter((f) =>
        clonedFeatureIds.includes(f.id)
      )
      const associatedSlugs = associatedFeatures
        .map((f) => f.slug)
        .sort()

      expect(associatedSlugs).toEqual(originalFeatureSlugs)
    })

    it('should not clone expired product features', async () => {
      // Create active product feature
      const activeProductFeature = await setupProductFeature({
        productId: product.id,
        featureId: features[0].id,
        organizationId: organization.id,
        livemode: false,
      })

      // Create expired product feature
      const expiredProductFeature = await adminTransaction(
        async ({ transaction }) => {
          const pf = await setupProductFeature({
            productId: product.id,
            featureId: features[1].id,
            organizationId: organization.id,
            livemode: false,
          })
          // Mark it as expired
          return await transaction
            .update(productFeatures)
            .set({ expiredAt: Date.now() })
            .where(eq(productFeatures.id, pf.id))
            .returning()
            .then((rows) => rows[0])
        }
      )

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Expired Features',
            },
            transaction
          )
        }
      )

      // Get cloned product
      const clonedProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      const clonedProduct = clonedProducts[0]

      // Get product features for cloned product
      const clonedProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: clonedProduct.id },
            transaction
          )
        }
      )

      // Should only have the active product feature, not the expired one
      expect(clonedProductFeatures).toHaveLength(1)
      expect(clonedProductFeatures.every((pf) => !pf.expiredAt)).toBe(
        true
      )
    })
  })

  describe('Complete Integration', () => {
    it('should clone a complete pricing model with all components', async () => {
      // Setup: Create a comprehensive pricing model with all components

      // 1. Create usage meters
      const meter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'API Requests',
        slug: 'api-requests-meter',
        livemode: false,
      })

      // 2. Create additional features
      const additionalFeature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Advanced Analytics',
        slug: 'advanced-analytics',
        description: 'Access to advanced analytics dashboard',
        livemode: false,
      })

      // 3. Create additional product
      const product2 = await setupProduct({
        name: 'Pro Plan',
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        livemode: false,
        active: true,
      })

      // Add price for the product
      await setupPrice({
        productId: product2.id,
        name: 'Pro Monthly',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: true,
        unitPrice: 5000,
      })

      // 4. Associate features with products
      // Associate features with first product
      await setupProductFeature({
        productId: product.id,
        featureId: features[0].id,
        organizationId: organization.id,
        livemode: false,
      })

      // Associate features with second product
      await setupProductFeature({
        productId: product2.id,
        featureId: additionalFeature.id,
        organizationId: organization.id,
        livemode: false,
      })

      await setupProductFeature({
        productId: product2.id,
        featureId: features[1].id,
        organizationId: organization.id,
        livemode: false,
      })

      // Clone the comprehensive pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Complete Clone',
            },
            transaction
          )
        }
      )

      // Verify all components were cloned

      // Check products and prices
      expect(clonedPricingModel.products).toHaveLength(2)
      const basicProduct = clonedPricingModel.products.find(
        (p) => p.name === 'Default Product'
      )
      const proProduct = clonedPricingModel.products.find(
        (p) => p.name === 'Pro Plan'
      )
      expect(basicProduct).toBeDefined()
      expect(proProduct).toBeDefined()
      expect(basicProduct?.prices).toHaveLength(1)
      expect(proProduct?.prices).toHaveLength(1)

      // Check usage meters
      expect(clonedPricingModel.usageMeters).toHaveLength(1)
      expect(clonedPricingModel.usageMeters[0].slug).toBe(
        'api-requests-meter'
      )

      // Check features
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedFeatures).toHaveLength(3) // 2 from beforeEach + 1 additional

      // Check product features
      const basicProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: basicProduct!.id },
            transaction
          )
        }
      )
      expect(basicProductFeatures).toHaveLength(1)

      const proProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: proProduct!.id },
            transaction
          )
        }
      )
      expect(proProductFeatures).toHaveLength(2)

      // Verify all IDs are new
      expect(clonedPricingModel.id).not.toBe(sourcePricingModel.id)
      expect(
        clonedPricingModel.products.every(
          (p) => p.id !== product.id && p.id !== product2.id
        )
      ).toBe(true)
      expect(
        clonedPricingModel.usageMeters.every(
          (m) => m.id !== meter1.id
        )
      ).toBe(true)
      expect(
        clonedFeatures.every(
          (f) =>
            f.id !== features[0].id &&
            f.id !== features[1].id &&
            f.id !== additionalFeature.id
        )
      ).toBe(true)
    })
  })

  describe('Livemode Handling', () => {
    it('should inherit livemode from source pricing model when destinationEnvironment is not specified', async () => {
      // Setup source pricing model with livemode = true
      const livemodeSource = await setupPricingModel({
        organizationId: organization.id,
        name: 'Livemode Source',
        livemode: true,
      })

      // Add various artifacts to the source pricing model
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        name: 'Test Meter',
        slug: 'test-meter',
        livemode: true,
      })

      const feature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        name: 'Test Feature',
        slug: 'test-feature',
        description: 'Test feature',
        livemode: true,
      })

      const product = await setupProduct({
        name: 'Livemode Product',
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        livemode: true,
        active: true,
      })

      await setupPrice({
        productId: product.id,
        name: 'Livemode Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        unitPrice: 1000,
      })

      await setupProductFeature({
        productId: product.id,
        featureId: feature.id,
        organizationId: organization.id,
        livemode: true,
      })

      // Clone without specifying destinationEnvironment
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: livemodeSource.id,
              name: 'Cloned Livemode',
              // destinationEnvironment not specified
            },
            transaction
          )
        }
      )

      // Verify pricing model livemode
      expect(clonedPricingModel.livemode).toBe(true)

      // Verify usage meters livemode
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(true)

      // Verify features livemode
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedFeatures).toHaveLength(1)
      expect(clonedFeatures[0].livemode).toBe(true)

      // Verify products and prices livemode
      expect(clonedPricingModel.products).toHaveLength(1)
      expect(clonedPricingModel.products[0].livemode).toBe(true)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
      expect(clonedPricingModel.products[0].prices[0].livemode).toBe(
        true
      )

      // Verify product features livemode
      const clonedProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: clonedPricingModel.products[0].id },
            transaction
          )
        }
      )
      expect(clonedProductFeatures).toHaveLength(1)
      expect(clonedProductFeatures[0].livemode).toBe(true)
    })

    it('should use specified destinationEnvironment (Livemode) when provided', async () => {
      // Setup source pricing model with livemode = false (testmode)
      const testmodeSource = await setupPricingModel({
        organizationId: organization.id,
        name: 'Testmode Source',
        livemode: false,
      })

      // Add artifacts to the source pricing model (all testmode)
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: testmodeSource.id,
        name: 'Test Meter',
        slug: 'test-meter-2',
        livemode: false,
      })

      const feature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: testmodeSource.id,
        name: 'Test Feature',
        slug: 'test-feature-2',
        description: 'Test feature',
        livemode: false,
      })

      const product = await setupProduct({
        name: 'Testmode Product',
        organizationId: organization.id,
        pricingModelId: testmodeSource.id,
        livemode: false,
        active: true,
      })

      await setupPrice({
        productId: product.id,
        name: 'Testmode Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: true,
        unitPrice: 2000,
      })

      await setupProductFeature({
        productId: product.id,
        featureId: feature.id,
        organizationId: organization.id,
        livemode: false,
      })

      // Clone with destinationEnvironment = Livemode (should override source's testmode)
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: testmodeSource.id,
              name: 'Cloned to Livemode',
              destinationEnvironment: DestinationEnvironment.Livemode,
            },
            transaction
          )
        }
      )

      // All artifacts should be livemode = true despite source being testmode
      expect(clonedPricingModel.livemode).toBe(true)

      // Verify usage meters livemode
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(true)

      // Verify features livemode
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedFeatures).toHaveLength(1)
      expect(clonedFeatures[0].livemode).toBe(true)

      // Verify products and prices livemode
      expect(clonedPricingModel.products).toHaveLength(1)
      expect(clonedPricingModel.products[0].livemode).toBe(true)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
      expect(clonedPricingModel.products[0].prices[0].livemode).toBe(
        true
      )

      // Verify product features livemode
      const clonedProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: clonedPricingModel.products[0].id },
            transaction
          )
        }
      )
      expect(clonedProductFeatures).toHaveLength(1)
      expect(clonedProductFeatures[0].livemode).toBe(true)
    })

    it('should use specified destinationEnvironment (Testmode) when provided', async () => {
      // Setup source pricing model with livemode = true
      const livemodeSource = await setupPricingModel({
        organizationId: organization.id,
        name: 'Livemode Source 2',
        livemode: true,
      })

      // Add artifacts to the source pricing model (all livemode)
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        name: 'Test Meter',
        slug: 'test-meter-3',
        livemode: true,
      })

      const feature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        name: 'Test Feature',
        slug: 'test-feature-3',
        description: 'Test feature',
        livemode: true,
      })

      const product = await setupProduct({
        name: 'Livemode Product 2',
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        livemode: true,
        active: true,
      })

      await setupPrice({
        productId: product.id,
        name: 'Livemode Price 2',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        unitPrice: 3000,
      })

      await setupProductFeature({
        productId: product.id,
        featureId: feature.id,
        organizationId: organization.id,
        livemode: true,
      })

      // Clone with destinationEnvironment = Testmode (should override source's livemode)
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: livemodeSource.id,
              name: 'Cloned to Testmode',
              destinationEnvironment: DestinationEnvironment.Testmode,
            },
            transaction
          )
        }
      )

      // All artifacts should be livemode = false despite source being livemode
      expect(clonedPricingModel.livemode).toBe(false)

      // Verify usage meters livemode
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(false)

      // Verify features livemode
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedFeatures).toHaveLength(1)
      expect(clonedFeatures[0].livemode).toBe(false)

      // Verify products and prices livemode
      expect(clonedPricingModel.products).toHaveLength(1)
      expect(clonedPricingModel.products[0].livemode).toBe(false)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
      expect(clonedPricingModel.products[0].prices[0].livemode).toBe(
        false
      )

      // Verify product features livemode
      const clonedProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: clonedPricingModel.products[0].id },
            transaction
          )
        }
      )
      expect(clonedProductFeatures).toHaveLength(1)
      expect(clonedProductFeatures[0].livemode).toBe(false)
    })

    it('should handle testmode source cloned without destinationEnvironment', async () => {
      // Setup source pricing model with livemode = false
      const testmodeSource = await setupPricingModel({
        organizationId: organization.id,
        name: 'Testmode Source 2',
        livemode: false,
      })

      // Add a simple artifact
      await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: testmodeSource.id,
        name: 'Test Meter',
        slug: 'test-meter-4',
        livemode: false,
      })

      // Clone without specifying destinationEnvironment
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: testmodeSource.id,
              name: 'Cloned Testmode',
              // destinationEnvironment not specified - should inherit false from source
            },
            transaction
          )
        }
      )

      // Should inherit testmode (livemode = false) from source
      expect(clonedPricingModel.livemode).toBe(false)

      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(false)
    })

    it('should not affect default pricing models across livemode boundaries when cloning', async () => {
      // Note: sourcePricingModel from beforeEach is already a livemode=true, isDefault=true pricing model
      // So we'll use that as our livemode default
      const livemodeDefaultPricingModel = sourcePricingModel

      // Get the testmode pricing model that setupOrg already created
      const testmodeDefaultPricingModel = await adminTransaction(
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

      // Verify both are default for their respective livemodes
      expect(livemodeDefaultPricingModel.isDefault).toBe(true)
      expect(livemodeDefaultPricingModel.livemode).toBe(true)
      expect(testmodeDefaultPricingModel.isDefault).toBe(true)
      expect(testmodeDefaultPricingModel.livemode).toBe(false)

      // Clone the livemode default pricing model
      const clonedLivemodePricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: livemodeDefaultPricingModel.id,
              name: 'Cloned Livemode PM',
            },
            transaction
          )
        }
      )

      // The cloned pricing model should NOT be default (cloning never sets isDefault=true)
      expect(clonedLivemodePricingModel.isDefault).toBe(false)
      expect(clonedLivemodePricingModel.livemode).toBe(true)

      // Verify the original livemode default is still default (unchanged by cloning)
      const refreshedLivemodeDefault = await adminTransaction(
        async ({ transaction }) => {
          return selectPricingModelById(
            livemodeDefaultPricingModel.id,
            transaction
          )
        }
      )
      expect(refreshedLivemodeDefault.isDefault).toBe(true)
      expect(refreshedLivemodeDefault.livemode).toBe(true)

      // Verify the testmode default is still default (unchanged by livemode cloning)
      const refreshedTestmodeDefault = await adminTransaction(
        async ({ transaction }) => {
          return selectPricingModelById(
            testmodeDefaultPricingModel.id,
            transaction
          )
        }
      )
      expect(refreshedTestmodeDefault.isDefault).toBe(true)
      expect(refreshedTestmodeDefault.livemode).toBe(false)

      // Clone testmode to livemode with destinationEnvironment
      const clonedCrossEnvironment = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: testmodeDefaultPricingModel.id,
              name: 'Cloned Cross Environment',
              destinationEnvironment: DestinationEnvironment.Livemode,
            },
            transaction
          )
        }
      )

      // The cloned pricing model should NOT be default
      expect(clonedCrossEnvironment.isDefault).toBe(false)
      expect(clonedCrossEnvironment.livemode).toBe(true)

      // Verify both original defaults are still default
      const finalLivemodeDefault = await adminTransaction(
        async ({ transaction }) => {
          return selectPricingModelById(
            livemodeDefaultPricingModel.id,
            transaction
          )
        }
      )
      expect(finalLivemodeDefault.isDefault).toBe(true)
      expect(finalLivemodeDefault.livemode).toBe(true)

      const finalTestmodeDefault = await adminTransaction(
        async ({ transaction }) => {
          return selectPricingModelById(
            testmodeDefaultPricingModel.id,
            transaction
          )
        }
      )
      expect(finalTestmodeDefault.isDefault).toBe(true)
      expect(finalTestmodeDefault.livemode).toBe(false)
    })
  })

  describe('Parent Association Validation', () => {
    it('should ensure all cloned resources reference only the new pricing model and have no references to old parents', async () => {
      // Create source pricing model with all types of resources
      const sourcePricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Source with All Resources',
        livemode: false,
      })

      // Create usage meters
      const sourceUsageMeter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'API Calls Meter',
        slug: 'api-calls-meter-validation',
        livemode: false,
      })

      const sourceUsageMeter2 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Storage Meter',
        slug: 'storage-meter-validation',
        livemode: false,
      })

      // Create features - one with usage meter reference
      const sourceToggleFeature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Toggle Feature',
        slug: 'toggle-feature-validation',
        description: 'Toggle feature for validation',
        livemode: false,
      })

      const sourceUsageFeature = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Usage Feature',
        slug: 'usage-feature-validation',
        description: 'Usage feature with meter reference',
        amount: 1000,
        usageMeterId: sourceUsageMeter1.id, // Reference to source usage meter
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: false,
      })

      // Create product with prices and features
      const sourceProduct = await setupProduct({
        name: 'Source Product',
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        livemode: false,
        active: true,
      })

      const sourcePrice = await setupPrice({
        productId: sourceProduct.id,
        name: 'Source Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: true,
        unitPrice: 5000,
      })

      // Associate features with product
      await setupProductFeature({
        productId: sourceProduct.id,
        featureId: sourceToggleFeature.id,
        organizationId: organization.id,
        livemode: false,
      })

      await setupProductFeature({
        productId: sourceProduct.id,
        featureId: sourceUsageFeature.id,
        organizationId: organization.id,
        livemode: false,
      })

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned for Validation',
            },
            transaction
          )
        }
      )

      // Validate that cloned pricing model is different from source
      expect(clonedPricingModel.id).not.toBe(sourcePricingModel.id)

      // 1. Validate Usage Meters - should reference new pricing model only
      const clonedUsageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      expect(clonedUsageMeters).toHaveLength(2)
      clonedUsageMeters.forEach((meter) => {
        // Should reference new pricing model
        expect(meter.pricingModelId).toBe(clonedPricingModel.id)
        // Should NOT reference old pricing model
        expect(meter.pricingModelId).not.toBe(sourcePricingModel.id)
        // Should have new IDs
        expect(meter.id).not.toBe(sourceUsageMeter1.id)
        expect(meter.id).not.toBe(sourceUsageMeter2.id)
      })

      // 2. Validate Features - should reference new pricing model and new usage meters
      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      expect(clonedFeatures).toHaveLength(2)

      const clonedToggleFeature = clonedFeatures.find(
        (f) => f.slug === 'toggle-feature-validation'
      )
      const clonedUsageFeature = clonedFeatures.find(
        (f) => f.slug === 'usage-feature-validation'
      )

      expect(clonedToggleFeature).toBeDefined()
      expect(clonedUsageFeature).toBeDefined()

      // Validate toggle feature associations
      expect(clonedToggleFeature!.pricingModelId).toBe(
        clonedPricingModel.id
      )
      expect(clonedToggleFeature!.pricingModelId).not.toBe(
        sourcePricingModel.id
      )
      expect(clonedToggleFeature!.id).not.toBe(sourceToggleFeature.id)
      expect(clonedToggleFeature!.usageMeterId).toBeNull()

      // Validate usage feature associations
      expect(clonedUsageFeature!.pricingModelId).toBe(
        clonedPricingModel.id
      )
      expect(clonedUsageFeature!.pricingModelId).not.toBe(
        sourcePricingModel.id
      )
      expect(clonedUsageFeature!.id).not.toBe(sourceUsageFeature.id)

      // CRITICAL: usageMeterId should reference the NEW usage meter, not the old one
      expect(clonedUsageFeature!.usageMeterId).not.toBeNull()
      expect(clonedUsageFeature!.usageMeterId).not.toBe(
        sourceUsageMeter1.id
      )

      // Find the corresponding new usage meter by slug
      const correspondingNewMeter = clonedUsageMeters.find(
        (m) => m.slug === 'api-calls-meter-validation'
      )
      expect(correspondingNewMeter).toBeDefined()
      expect(clonedUsageFeature!.usageMeterId).toBe(
        correspondingNewMeter!.id
      )

      // 3. Validate Products - should reference new pricing model
      const clonedProducts = await adminTransaction(
        async ({ transaction }) => {
          return selectPricesAndProductsByProductWhere(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      expect(clonedProducts).toHaveLength(1)
      const clonedProduct = clonedProducts[0]

      expect(clonedProduct.pricingModelId).toBe(clonedPricingModel.id)
      expect(clonedProduct.pricingModelId).not.toBe(
        sourcePricingModel.id
      )
      expect(clonedProduct.id).not.toBe(sourceProduct.id)

      // 4. Validate Prices - should reference new products
      expect(clonedProduct.prices).toHaveLength(1)
      const clonedPrice = clonedProduct.prices[0]

      expect(clonedPrice.productId).toBe(clonedProduct.id)
      expect(clonedPrice.productId).not.toBe(sourceProduct.id)

      // 5. Validate Product Features - should reference new products and new features
      const clonedProductFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectProductFeatures(
            { productId: clonedProduct.id },
            transaction
          )
        }
      )

      expect(clonedProductFeatures).toHaveLength(2)

      clonedProductFeatures.forEach((pf) => {
        // Should reference new product
        expect(pf.productId).toBe(clonedProduct.id)
        expect(pf.productId).not.toBe(sourceProduct.id)

        // Should reference new features (not old ones)
        expect(pf.featureId).not.toBe(sourceToggleFeature.id)
        expect(pf.featureId).not.toBe(sourceUsageFeature.id)

        // Should be one of the new feature IDs
        const newFeatureIds = clonedFeatures.map((f) => f.id)
        expect(newFeatureIds).toContain(pf.featureId)
      })

      // 6. Final validation - ensure NO resources from old pricing model are referenced
      // Get all resource IDs from source
      const sourceResourceIds = [
        sourcePricingModel.id,
        sourceUsageMeter1.id,
        sourceUsageMeter2.id,
        sourceToggleFeature.id,
        sourceUsageFeature.id,
        sourceProduct.id,
      ]

      // Check that none of the cloned resources reference any source IDs
      const allClonedIds = [
        clonedPricingModel.id,
        ...clonedUsageMeters.map((m) => m.id),
        ...clonedUsageMeters.map((m) => m.pricingModelId),
        ...clonedFeatures.map((f) => f.id),
        ...clonedFeatures.map((f) => f.pricingModelId),
        ...clonedFeatures
          .map((f) => f.usageMeterId)
          .filter((id) => id !== null),
        ...clonedProducts.map((p) => p.id),
        ...clonedProducts.map((p) => p.pricingModelId),
        ...clonedProducts.flatMap((p) => p.prices.map((pr) => pr.id)),
        ...clonedProducts.flatMap((p) =>
          p.prices.map((pr) => pr.productId)
        ),
        ...clonedProductFeatures.map((pf) => pf.id),
        ...clonedProductFeatures.map((pf) => pf.productId),
        ...clonedProductFeatures.map((pf) => pf.featureId),
      ]

      // None of the cloned IDs should match any source IDs
      allClonedIds.forEach((clonedId) => {
        if (clonedId) {
          expect(sourceResourceIds).not.toContain(clonedId)
        }
      })
    })

    it('should correctly remap multiple features with different usage meter references', async () => {
      // Create source pricing model
      const sourcePricingModel = await setupPricingModel({
        organizationId: organization.id,
        name: 'Source with Multiple Meters',
        livemode: false,
      })

      // Create multiple usage meters
      const meter1 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Meter 1',
        slug: 'meter-1',
        livemode: false,
      })

      const meter2 = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Meter 2',
        slug: 'meter-2',
        livemode: false,
      })

      // Create features referencing different meters
      const feature1 = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Feature with Meter 1',
        slug: 'feature-meter-1',
        description: 'References meter 1',
        amount: 100,
        usageMeterId: meter1.id,
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
        livemode: false,
      })

      const feature2 = await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Feature with Meter 2',
        slug: 'feature-meter-2',
        description: 'References meter 2',
        amount: 200,
        usageMeterId: meter2.id,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
      })

      const feature3 = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Feature with No Meter',
        slug: 'feature-no-meter',
        description: 'No meter reference',
        livemode: false,
      })

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async ({ transaction }) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Multiple Meters',
            },
            transaction
          )
        }
      )

      // Get cloned meters and features
      const clonedMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      const clonedFeatures = await adminTransaction(
        async ({ transaction }) => {
          return selectFeatures(
            { pricingModelId: clonedPricingModel.id },
            transaction
          )
        }
      )

      // Find specific meters and features by slug
      const newMeter1 = clonedMeters.find((m) => m.slug === 'meter-1')
      const newMeter2 = clonedMeters.find((m) => m.slug === 'meter-2')
      const newFeature1 = clonedFeatures.find(
        (f) => f.slug === 'feature-meter-1'
      )
      const newFeature2 = clonedFeatures.find(
        (f) => f.slug === 'feature-meter-2'
      )
      const newFeature3 = clonedFeatures.find(
        (f) => f.slug === 'feature-no-meter'
      )

      expect(newMeter1).toBeDefined()
      expect(newMeter2).toBeDefined()
      expect(newFeature1).toBeDefined()
      expect(newFeature2).toBeDefined()
      expect(newFeature3).toBeDefined()

      // Validate correct meter remapping
      expect(newFeature1!.usageMeterId).toBe(newMeter1!.id)
      expect(newFeature1!.usageMeterId).not.toBe(meter1.id)

      expect(newFeature2!.usageMeterId).toBe(newMeter2!.id)
      expect(newFeature2!.usageMeterId).not.toBe(meter2.id)

      expect(newFeature3!.usageMeterId).toBeNull()

      // Validate all features reference the new pricing model
      const allNewFeatures = [
        newFeature1!,
        newFeature2!,
        newFeature3!,
      ]
      allNewFeatures.forEach((feature) => {
        expect(feature.pricingModelId).toBe(clonedPricingModel.id)
        expect(feature.pricingModelId).not.toBe(sourcePricingModel.id)
      })
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
                trialPeriodDays: 0,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
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
    expect(product.singularQuantityLabel).toBe('singular')
    expect(product.pluralQuantityLabel).toBe('plural')
    expect(product.pricingModelId).toBe(sourcePricingModel.id)
    expect(prices).toHaveLength(1)
    expect(price.name).toBe('Test Price')
    expect(price.type).toBe(PriceType.Subscription)
    expect(price.intervalCount).toBe(1)
    expect(price.intervalUnit).toBe(IntervalUnit.Month)
    expect(price.unitPrice).toBe(1000)
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
                trialPeriodDays: 0,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
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
                trialPeriodDays: 0,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
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
