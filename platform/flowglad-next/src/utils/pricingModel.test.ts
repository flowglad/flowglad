import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import {
  setupOrg,
  setupPrice,
  setupPricingModel,
  setupProduct,
  setupProductFeature,
  setupToggleFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { comprehensiveAuthenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import {
  ProductFeature,
  productFeatures,
} from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  insertPrice,
  selectPriceById,
  selectPrices,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import {
  selectPricingModelById,
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { selectProductFeatures } from '@/db/tableMethods/productFeatureMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import { withAdminCacheContext } from '@/test-utils/transactionCallbacks'
import {
  CurrencyCode,
  DestinationEnvironment,
  FeatureType,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  PriceType,
} from '@/types'
import { core } from '@/utils/core'
import {
  clonePricingModelTransaction,
  createPriceTransaction,
  createProductTransaction,
  editProductTransaction,
} from './pricingModel'

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

    // Use testmode source pricing model to avoid livemode uniqueness constraint
    // (setupOrg creates one livemode PM which we leave untouched)
    sourcePricingModel = await setupPricingModel({
      organizationId: organization.id,
      name: 'Testmode Source PricingModel',
      livemode: false,
      isDefault: false,
    })

    // Create testmode product and price for the source PM
    product = await setupProduct({
      name: 'Testmode Product',
      organizationId: organization.id,
      pricingModelId: sourcePricingModel.id,
      livemode: false,
      active: true,
    })

    price = await setupPrice({
      productId: product.id,
      name: 'Testmode Price',
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: false,
      isDefault: true,
      unitPrice: 1000,
    })

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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned Pricing Model',
            },
            ctx
          )
        }
      )

      expect(clonedPricingModel).toMatchObject({})
      expect(clonedPricingModel.products).toHaveLength(1)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
    })

    it('should create a new pricing model with the specified name', async () => {
      const newName = 'New PricingModel Name'
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: newName,
            },
            ctx
          )
        }
      )

      expect(clonedPricingModel.name).toBe(newName)
    })

    it('should set isDefault to false on the cloned pricing model', async () => {
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
          )
        }
      )

      expect(clonedPricingModel.isDefault).toBe(false)
    })

    it('should preserve the livemode value from the source pricing model', async () => {
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
          )
        }
      )

      expect(clonedPricingModel.livemode).toBe(
        sourcePricingModel.livemode
      )
    })

    it('should maintain the same organizationId as the source pricing model', async () => {
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
        livemode: false, // Use testmode to avoid livemode uniqueness constraint
      })

      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: emptyPricingModel.id,
              name: 'Cloned Empty PricingModel',
            },
            ctx
          )
        }
      )

      expect(clonedPricingModel.products).toHaveLength(0)
    })

    it('should handle a pricing model with multiple products correctly', async () => {
      // Create additional products in source pricing model (testmode)
      const product2 = await setupProduct({
        name: 'Second Product',
        organizationId: organization.id,
        livemode: false, // Match sourcePricingModel livemode
        pricingModelId: sourcePricingModel.id,
        active: true,
      })

      await setupPrice({
        productId: product2.id,
        name: 'Second Product Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false, // Match sourcePricingModel livemode
        isDefault: true,
        unitPrice: 2000,
      })

      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned Multi-Product PricingModel',
            },
            ctx
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
      const sourceProducts = await adminTransaction(async (ctx) => {
        const productsWithPrices =
          await selectPricesAndProductsByProductWhere(
            {
              pricingModelId: sourcePricingModel.id,
            },
            ctx.transaction
          )
        return productsWithPrices
      })

      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
          )
        }
      )

      const clonedProductId = clonedPricingModel.products[0].id
      expect(clonedProductId).not.toBe(sourceProductId)
    })

    it('should preserve all product attributes except ID and pricingModelId', async () => {
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
      const sourcePrices = await adminTransaction(async (ctx) => {
        const productsWithPrices =
          await selectPricesAndProductsByProductWhere(
            {
              pricingModelId: sourcePricingModel.id,
            },
            ctx.transaction
          )
        return productsWithPrices.flatMap(({ prices }) => prices)
      })

      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
          )
        }
      )

      const clonedPriceId =
        clonedPricingModel.products[0].prices[0].id
      expect(clonedPriceId).not.toBe(sourcePriceId)
    })

    it('should preserve all price attributes except ID and productId', async () => {
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
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
        async (ctx) => {
          return (
            await selectPricingModelById(
              sourcePricingModel.id,
              ctx.transaction
            )
          ).unwrap()
        }
      )

      const originalProducts = await adminTransaction(async (ctx) => {
        return selectPricesAndProductsByProductWhere(
          {
            pricingModelId: sourcePricingModel.id,
          },
          ctx.transaction
        )
      })

      await adminTransaction(async (ctx) => {
        return clonePricingModelTransaction(
          {
            id: sourcePricingModel.id,
            name: 'Cloned PricingModel',
          },
          ctx
        )
      })

      const pricingModelAfterClone = await adminTransaction(
        async (ctx) => {
          return (
            await selectPricingModelById(
              sourcePricingModel.id,
              ctx.transaction
            )
          ).unwrap()
        }
      )

      const productsAfterClone = await adminTransaction(
        async (ctx) => {
          return selectPricesAndProductsByProductWhere(
            {
              pricingModelId: sourcePricingModel.id,
            },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned PricingModel',
            },
            ctx
          )
        }
      )
      expect(clonedPricingModel).toMatchObject({})
      const clonedProducts = await adminTransaction(async (ctx) => {
        return selectPricesAndProductsByProductWhere(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Usage Meters',
            },
            ctx
          )
        }
      )

      // Verify usage meters were cloned
      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned without Usage Meters',
            },
            ctx
          )
        }
      )

      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Features',
            },
            ctx
          )
        }
      )

      // Verify features were cloned
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })

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
      expect(clonedToggle).toMatchObject({ type: FeatureType.Toggle })
      expect(clonedToggle?.type).toBe(FeatureType.Toggle)
      expect(clonedToggle?.name).toBe('Premium Support')
      expect(clonedToggle?.id).not.toBe(toggleFeature.id)

      // Check usage feature with all attributes
      const clonedUsage = newFeatures.find(
        (f) => f.slug === 'api-requests'
      )
      expect(clonedUsage).toMatchObject({
        type: FeatureType.UsageCreditGrant,
      })
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
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Meter Dependencies',
            },
            ctx
          )
        }
      )

      // Get cloned usage meter
      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
          )
        }
      )
      const clonedMeter = clonedUsageMeters.find(
        (m) => m.slug === 'data-transfer'
      )
      expect(typeof clonedMeter).toBe('object')

      // Get cloned features
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
      const clonedFeature = clonedFeatures.find(
        (f) => f.slug === 'bandwidth-usage'
      )
      expect(clonedFeature).toMatchObject({
        usageMeterId: clonedMeter?.id,
      })

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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Product Features',
            },
            ctx
          )
        }
      )

      // Get cloned product
      const clonedProducts = await adminTransaction(async (ctx) => {
        return selectPricesAndProductsByProductWhere(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
      expect(clonedProducts).toHaveLength(1)
      const clonedProduct = clonedProducts[0]

      // Get cloned features
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })

      // Get product features for cloned product
      const clonedProductFeatures = await adminTransaction(
        async (ctx) => {
          return selectProductFeatures(
            { productId: clonedProduct.id },
            ctx.transaction
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
        async (ctx) => {
          const pf = await setupProductFeature({
            productId: product.id,
            featureId: features[1].id,
            organizationId: organization.id,
            livemode: false,
          })
          // Mark it as expired
          return await ctx.transaction
            .update(productFeatures)
            .set({ expiredAt: Date.now() })
            .where(eq(productFeatures.id, pf.id))
            .returning()
            .then((rows) => rows[0])
        }
      )

      // Clone the pricing model
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Expired Features',
            },
            ctx
          )
        }
      )

      // Get cloned product
      const clonedProducts = await adminTransaction(async (ctx) => {
        return selectPricesAndProductsByProductWhere(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
      const clonedProduct = clonedProducts[0]

      // Get product features for cloned product
      const clonedProductFeatures = await adminTransaction(
        async (ctx) => {
          return selectProductFeatures(
            { productId: clonedProduct.id },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Complete Clone',
            },
            ctx
          )
        }
      )

      // Verify all components were cloned

      // Check products and prices
      expect(clonedPricingModel.products).toHaveLength(2)
      const basicProduct = clonedPricingModel.products.find(
        (p) => p.name === 'Testmode Product'
      )
      const proProduct = clonedPricingModel.products.find(
        (p) => p.name === 'Pro Plan'
      )
      expect(typeof basicProduct).toBe('object')
      expect(typeof proProduct).toBe('object')
      expect(basicProduct?.prices).toHaveLength(1)
      expect(proProduct?.prices).toHaveLength(1)

      // Check usage meters
      expect(clonedPricingModel.usageMeters).toHaveLength(1)
      expect(clonedPricingModel.usageMeters[0].slug).toBe(
        'api-requests-meter'
      )

      // Check features
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
      expect(clonedFeatures).toHaveLength(3) // 2 from beforeEach + 1 additional

      // Check product features
      const basicProductFeatures = await adminTransaction(
        async (ctx) => {
          return selectProductFeatures(
            { productId: basicProduct!.id },
            ctx.transaction
          )
        }
      )
      expect(basicProductFeatures).toHaveLength(1)

      const proProductFeatures = await adminTransaction(
        async (ctx) => {
          return selectProductFeatures(
            { productId: proProduct!.id },
            ctx.transaction
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
      // sourcePricingModel from beforeEach is testmode - use it to test inheritance
      // Add usage meter to verify inheritance of all artifacts
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'Test Meter',
        slug: 'test-meter-inherit',
        livemode: false,
      })

      // Clone without specifying destinationEnvironment
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned Testmode',
              // destinationEnvironment not specified - should inherit testmode
            },
            ctx
          )
        }
      )

      // Verify pricing model inherited testmode (livemode = false)
      expect(clonedPricingModel.livemode).toBe(false)

      // Verify usage meters livemode
      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(false)

      // Verify features livemode
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
      // Features from beforeEach
      expect(clonedFeatures.length).toBeGreaterThan(0)
      expect(clonedFeatures.every((f) => f.livemode === false)).toBe(
        true
      )

      // Verify products and prices livemode
      expect(clonedPricingModel.products).toHaveLength(1)
      expect(clonedPricingModel.products[0].livemode).toBe(false)
      expect(clonedPricingModel.products[0].prices).toHaveLength(1)
      expect(clonedPricingModel.products[0].prices[0].livemode).toBe(
        false
      )
    })

    it('should use specified destinationEnvironment (Testmode) when provided to override source livemode', async () => {
      // Get the livemode PM from setupOrg to use as source
      const livemodeSource = await adminTransaction(async (ctx) => {
        const [pm] = await selectPricingModels(
          { organizationId: organization.id, livemode: true },
          ctx.transaction
        )
        return pm!
      })

      // Add artifacts to the livemode source pricing model
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        name: 'Test Meter',
        slug: 'test-meter-2',
        livemode: true,
      })

      const feature = await setupToggleFeature({
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        name: 'Test Feature',
        slug: 'test-feature-2',
        description: 'Test feature',
        livemode: true,
      })

      const testProduct = await setupProduct({
        name: 'Livemode Product',
        organizationId: organization.id,
        pricingModelId: livemodeSource.id,
        livemode: true,
        active: true,
      })

      await setupPrice({
        productId: testProduct.id,
        name: 'Livemode Price',
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: true,
        unitPrice: 2000,
      })

      await setupProductFeature({
        productId: testProduct.id,
        featureId: feature.id,
        organizationId: organization.id,
        livemode: true,
      })

      // Clone with destinationEnvironment = Testmode (should override source's livemode)
      const clonedPricingModel = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: livemodeSource.id,
              name: 'Cloned to Testmode',
              destinationEnvironment: DestinationEnvironment.Testmode,
            },
            ctx
          )
        }
      )

      // All artifacts should be livemode = false despite source being livemode
      expect(clonedPricingModel.livemode).toBe(false)

      // Verify usage meters livemode
      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(false)

      // Verify features livemode
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })
      expect(clonedFeatures).toHaveLength(1)
      expect(clonedFeatures[0].livemode).toBe(false)

      // Verify products and prices livemode (filter to non-default products)
      const clonedProducts = clonedPricingModel.products.filter(
        (p) => !p.default
      )
      expect(clonedProducts).toHaveLength(1)
      expect(clonedProducts[0].livemode).toBe(false)
      expect(clonedProducts[0].prices).toHaveLength(1)
      expect(clonedProducts[0].prices[0].livemode).toBe(false)

      // Verify product features livemode
      const clonedProductFeatures = await adminTransaction(
        async (ctx) => {
          return selectProductFeatures(
            { productId: clonedProducts[0].id },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: testmodeSource.id,
              name: 'Cloned Testmode',
              // destinationEnvironment not specified - should inherit false from source
            },
            ctx
          )
        }
      )

      // Should inherit testmode (livemode = false) from source
      expect(clonedPricingModel.livemode).toBe(false)

      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
          )
        }
      )
      expect(clonedUsageMeters).toHaveLength(1)
      expect(clonedUsageMeters[0].livemode).toBe(false)
    })

    it('should not affect default pricing models across livemode boundaries when cloning', async () => {
      // Get the livemode default pricing model from setupOrg
      const livemodeDefaultPricingModel = await adminTransaction(
        async (ctx) => {
          const [pm] = await selectPricingModels(
            {
              organizationId: organization.id,
              livemode: true,
              isDefault: true,
            },
            ctx.transaction
          )
          return pm!
        }
      )

      // Get the testmode pricing model that setupOrg already created
      const testmodeDefaultPricingModel = await adminTransaction(
        async (ctx) => {
          const [pricingModel] = await selectPricingModels(
            {
              organizationId: organization.id,
              livemode: false,
              isDefault: true,
            },
            ctx.transaction
          )
          return pricingModel!
        }
      )

      // Verify both are default for their respective livemodes
      expect(livemodeDefaultPricingModel.isDefault).toBe(true)
      expect(livemodeDefaultPricingModel.livemode).toBe(true)
      expect(testmodeDefaultPricingModel.isDefault).toBe(true)
      expect(testmodeDefaultPricingModel.livemode).toBe(false)

      // Clone the livemode default pricing model TO TESTMODE
      // (Can't clone to livemode due to uniqueness constraint)
      const clonedToTestmode = await adminTransaction(async (ctx) => {
        return clonePricingModelTransaction(
          {
            id: livemodeDefaultPricingModel.id,
            name: 'Cloned Livemode PM to Testmode',
            destinationEnvironment: DestinationEnvironment.Testmode,
          },
          ctx
        )
      })

      // The cloned pricing model should NOT be default (cloning never sets isDefault=true)
      expect(clonedToTestmode.isDefault).toBe(false)
      expect(clonedToTestmode.livemode).toBe(false)

      // Verify the original livemode default is still default (unchanged by cloning)
      const refreshedLivemodeDefault = await adminTransaction(
        async (ctx) => {
          return (
            await selectPricingModelById(
              livemodeDefaultPricingModel.id,
              ctx.transaction
            )
          ).unwrap()
        }
      )
      expect(refreshedLivemodeDefault.isDefault).toBe(true)
      expect(refreshedLivemodeDefault.livemode).toBe(true)

      // Verify the testmode default is still default (unchanged by cloning to testmode)
      const refreshedTestmodeDefault = await adminTransaction(
        async (ctx) => {
          return (
            await selectPricingModelById(
              testmodeDefaultPricingModel.id,
              ctx.transaction
            )
          ).unwrap()
        }
      )
      expect(refreshedTestmodeDefault.isDefault).toBe(true)
      expect(refreshedTestmodeDefault.livemode).toBe(false)

      // Clone testmode PM to testmode (verify cross-PM cloning doesn't affect defaults)
      const clonedTestmodeToTestmode = await adminTransaction(
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: testmodeDefaultPricingModel.id,
              name: 'Cloned Testmode to Testmode',
              destinationEnvironment: DestinationEnvironment.Testmode,
            },
            ctx
          )
        }
      )

      // The cloned pricing model should NOT be default
      expect(clonedTestmodeToTestmode.isDefault).toBe(false)
      expect(clonedTestmodeToTestmode.livemode).toBe(false)

      // Verify both original defaults are still default
      const finalLivemodeDefault = await adminTransaction(
        async (ctx) => {
          return (
            await selectPricingModelById(
              livemodeDefaultPricingModel.id,
              ctx.transaction
            )
          ).unwrap()
        }
      )
      expect(finalLivemodeDefault.isDefault).toBe(true)
      expect(finalLivemodeDefault.livemode).toBe(true)

      const finalTestmodeDefault = await adminTransaction(
        async (ctx) => {
          return (
            await selectPricingModelById(
              testmodeDefaultPricingModel.id,
              ctx.transaction
            )
          ).unwrap()
        }
      )
      expect(finalTestmodeDefault.isDefault).toBe(true)
      expect(finalTestmodeDefault.livemode).toBe(false)
    })

    it('should reject cloning to livemode when organization already has a livemode pricing model', async () => {
      // setupOrg creates a livemode pricing model, so attempting to clone
      // another pricing model to livemode should fail with the expected error

      await expect(
        adminTransaction(async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Attempted Livemode Clone',
              destinationEnvironment: DestinationEnvironment.Livemode,
            },
            ctx
          )
        })
      ).rejects.toThrow(
        'Cannot clone to livemode: Your organization already has a livemode pricing model. ' +
          'Each organization can have at most one livemode pricing model. ' +
          'To clone this pricing model, please select "Test mode" as the destination environment instead.'
      )
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned for Validation',
            },
            ctx
          )
        }
      )

      // Validate that cloned pricing model is different from source
      expect(clonedPricingModel.id).not.toBe(sourcePricingModel.id)

      // 1. Validate Usage Meters - should reference new pricing model only
      const clonedUsageMeters = await adminTransaction(
        async (ctx) => {
          return selectUsageMeters(
            { pricingModelId: clonedPricingModel.id },
            ctx.transaction
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
      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })

      expect(clonedFeatures).toHaveLength(2)

      const clonedToggleFeature = clonedFeatures.find(
        (f) => f.slug === 'toggle-feature-validation'
      )
      const clonedUsageFeature = clonedFeatures.find(
        (f) => f.slug === 'usage-feature-validation'
      )

      expect(typeof clonedToggleFeature).toBe('object')
      expect(typeof clonedUsageFeature).toBe('object')

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
      expect(typeof clonedUsageFeature!.usageMeterId).toBe('string')
      expect(clonedUsageFeature!.usageMeterId).not.toBe(
        sourceUsageMeter1.id
      )

      // Find the corresponding new usage meter by slug
      const correspondingNewMeter = clonedUsageMeters.find(
        (m) => m.slug === 'api-calls-meter-validation'
      )
      expect(typeof correspondingNewMeter).toBe('object')
      expect(clonedUsageFeature!.usageMeterId).toBe(
        correspondingNewMeter!.id
      )

      // 3. Validate Products - should reference new pricing model
      const clonedProducts = await adminTransaction(async (ctx) => {
        return selectPricesAndProductsByProductWhere(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })

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
        async (ctx) => {
          return selectProductFeatures(
            { productId: clonedProduct.id },
            ctx.transaction
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
        async (ctx) => {
          return clonePricingModelTransaction(
            {
              id: sourcePricingModel.id,
              name: 'Cloned with Multiple Meters',
            },
            ctx
          )
        }
      )

      // Get cloned meters and features
      const clonedMeters = await adminTransaction(async (ctx) => {
        return selectUsageMeters(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })

      const clonedFeatures = await adminTransaction(async (ctx) => {
        return selectFeatures(
          { pricingModelId: clonedPricingModel.id },
          ctx.transaction
        )
      })

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

      expect(newMeter1).toMatchObject({})
      expect(newMeter2).toMatchObject({})
      expect(newFeature1).toMatchObject({})
      expect(newFeature2).toMatchObject({})
      expect(newFeature3).toMatchObject({})

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

describe('createPriceTransaction', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let defaultProduct: Product.Record
  let userId: string

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    pricingModel = orgSetup.pricingModel
    defaultProduct = orgSetup.product
    const userApiKey = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    userId = userApiKey.user.id
  })

  it('creates a price for a non-default product', async () => {
    const nonDefaultProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Additional Product',
      livemode: true,
    })

    const createdPrice = await adminTransaction(async (ctx) => {
      return createPriceTransaction(
        {
          price: {
            name: 'Additional Product Price',
            productId: nonDefaultProduct.id,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 2500,
            trialPeriodDays: 0,
            usageMeterId: null,
            usageEventsPerUnit: null,
            isDefault: true,
            slug: `additional-product-price-${core.nanoid()}`,
          },
        },
        { ...ctx, livemode: true, organizationId: organization.id }
      )
    })

    expect(createdPrice.productId).toBe(nonDefaultProduct.id)
    expect(createdPrice.unitPrice).toBe(2500)
    expect(createdPrice.currency).toBe(organization.defaultCurrency)
  })

  it('rejects creating additional prices for a default product', async () => {
    await expect(
      adminTransaction(async (ctx) => {
        return createPriceTransaction(
          {
            price: {
              name: 'Disallowed Additional Price',
              productId: defaultProduct.id,
              type: PriceType.Subscription,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              unitPrice: 3000,
              trialPeriodDays: 0,
              usageMeterId: null,
              usageEventsPerUnit: null,
              isDefault: false,
              slug: `disallowed-price-${core.nanoid()}`,
            },
          },
          { ...ctx, livemode: true, organizationId: organization.id }
        )
      })
    ).rejects.toThrow(
      'Cannot create additional prices for the default plan'
    )
  })

  it('allows creating an additional price with the same type', async () => {
    const nonDefaultProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Additional Product',
      livemode: true,
    })
    const firstPrice = await adminTransaction(async (ctx) => {
      return createPriceTransaction(
        {
          price: {
            name: 'Initial Subscription Price',
            productId: nonDefaultProduct.id,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 2500,
            trialPeriodDays: 0,
            usageMeterId: null,
            usageEventsPerUnit: null,
            isDefault: true,
            slug: `initial-subscription-price-${core.nanoid()}`,
          },
        },
        { ...ctx, livemode: true, organizationId: organization.id }
      )
    })

    expect(firstPrice.productId).toBe(nonDefaultProduct.id)
    expect(firstPrice.unitPrice).toBe(2500)

    const updatedUnitPrice = 3500
    const updatedPrice = await adminTransaction(async (ctx) => {
      return createPriceTransaction(
        {
          price: {
            name: 'Additional Subscription Price',
            productId: nonDefaultProduct.id,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: updatedUnitPrice,
            trialPeriodDays: 0,
            usageMeterId: null,
            usageEventsPerUnit: null,
            isDefault: false,
            slug: `additional-subscription-price-${core.nanoid()}`,
          },
        },
        { ...ctx, livemode: true, organizationId: organization.id }
      )
    })

    expect(updatedPrice.productId).toBe(nonDefaultProduct.id)
    expect(updatedPrice.unitPrice).toBe(updatedUnitPrice)
    expect(updatedPrice.currency).toBe(organization.defaultCurrency)
    expect(updatedPrice.type).toBe(PriceType.Subscription)
    expect(updatedPrice.isDefault).toBe(true) // newly created price is always set as the default
    expect(updatedPrice.active).toBe(true)
  })

  it('rejects creating an additional price with a different type', async () => {
    const nonDefaultProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Additional Product',
      livemode: true,
    })

    await adminTransaction(async (ctx) => {
      return createPriceTransaction(
        {
          price: {
            name: 'Initial Subscription Price',
            productId: nonDefaultProduct.id,
            type: PriceType.Subscription,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            unitPrice: 2500,
            trialPeriodDays: 0,
            usageMeterId: null,
            usageEventsPerUnit: null,
            isDefault: true,
            slug: `initial-subscription-price-${core.nanoid()}`,
          },
        },
        { ...ctx, livemode: true, organizationId: organization.id }
      )
    })

    await expect(
      adminTransaction(async (ctx) => {
        return createPriceTransaction(
          {
            price: {
              name: 'Mismatched Type Price',
              productId: nonDefaultProduct.id,
              type: PriceType.SinglePayment,
              unitPrice: 3500,
              intervalUnit: null,
              intervalCount: null,
              trialPeriodDays: null,
              usageMeterId: null,
              usageEventsPerUnit: null,
              isDefault: false,
              slug: `mismatched-type-price-${core.nanoid()}`,
            },
          },
          { ...ctx, livemode: true, organizationId: organization.id }
        )
      })
    ).rejects.toThrow(
      'Cannot create price of a different type than the existing prices for the product'
    )
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
    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await createProductTransaction(
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
          params
        )
        return Result.ok(txResult)
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
    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await createProductTransaction(
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
          params
        )
        return Result.ok(txResult)
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )

    const { product } = result
    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(productFeatures).toHaveLength(2)
    expect(productFeatures.map((pf) => pf.featureId).sort()).toEqual(
      featureIds.sort()
    )
  })

  it('should create a product without features if featureIds is not provided', async () => {
    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await createProductTransaction(
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
          params
        )
        return Result.ok(txResult)
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )

    const { product } = result
    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(productFeatures).toHaveLength(0)
  })

  it('should throw an error when creating a usage price with featureIds', async () => {
    // Setup: Create a usage meter for the usage price
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: sourcePricingModel.id,
      name: 'API Calls',
      slug: 'api-calls',
      livemode: false,
    })

    const featureIds = features.map((f) => f.id)

    // Test: Attempting to create a usage price with featureIds should throw
    await expect(
      comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await createProductTransaction(
            {
              product: {
                name: 'Test Product Usage Price with Features',
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
                  name: 'Usage Price',
                  type: PriceType.Usage,
                  intervalCount: 1,
                  intervalUnit: IntervalUnit.Month,
                  unitPrice: 100,
                  trialPeriodDays: null,
                  active: true,
                  usageMeterId: usageMeter.id,
                  usageEventsPerUnit: 1,
                  isDefault: true,
                  slug: `flowglad-test-usage-price+${core.nanoid()}`,
                },
              ],
              featureIds, // This should cause an error
            },
            params
          )
          return Result.ok(txResult)
        },
        {
          apiKey: org1ApiKeyToken,
        }
      )
    ).rejects.toThrow(
      'Cannot create usage prices with feature assignments. Usage prices must be associated with usage meters only.'
    )
  })

  it('should create a product with a usage price when there are no featureIds', async () => {
    // Setup: Create a usage meter for the usage price
    // Must use livemode: true to match org1ApiKey.livemode, otherwise RLS
    // livemode policy will filter out the usage meter during prices INSERT check
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: sourcePricingModel.id,
      name: 'API Requests',
      slug: 'api-requests',
      livemode: true,
    })

    // Test: Create a usage price product without featureIds - should succeed
    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await createProductTransaction(
          {
            product: {
              name: 'API Usage Product',
              description: 'Product with usage-based pricing',
              active: true,
              imageURL: null,
              singularQuantityLabel: 'request',
              pluralQuantityLabel: 'requests',
              pricingModelId: sourcePricingModel.id,
              default: false,
              slug: `flowglad-usage-product+${core.nanoid()}`,
            },
            prices: [
              {
                name: 'Per-Request Pricing',
                type: PriceType.Usage,
                intervalCount: 1,
                intervalUnit: IntervalUnit.Month,
                unitPrice: 50,
                trialPeriodDays: null,
                active: true,
                usageMeterId: usageMeter.id,
                usageEventsPerUnit: 1,
                isDefault: true,
                slug: `flowglad-usage-price+${core.nanoid()}`,
              },
            ],
            // featureIds intentionally omitted - should be allowed for usage prices
          },
          params
        )
        return Result.ok(txResult)
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )

    const { product, prices } = result
    const price = prices[0]

    // Verify product was created correctly
    expect(product.name).toBe('API Usage Product')
    expect(product.description).toBe(
      'Product with usage-based pricing'
    )
    expect(product.active).toBe(true)
    expect(product.singularQuantityLabel).toBe('request')
    expect(product.pluralQuantityLabel).toBe('requests')

    // Verify usage price was created correctly
    expect(prices).toHaveLength(1)
    expect(price.name).toBe('Per-Request Pricing')
    expect(price.type).toBe(PriceType.Usage)
    expect(price.usageMeterId).toBe(usageMeter.id)
    expect(price.usageEventsPerUnit).toBe(1)
    expect(price.unitPrice).toBe(50)
    expect(price.isDefault).toBe(true)
    expect(price.active).toBe(true)

    // Verify no product features are associated (since featureIds was not provided)
    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(productFeatures).toHaveLength(0)
  })

  it('should throw an error when creating a SinglePayment product with toggle features', async () => {
    // Create toggle features with livemode: true to match the API key's livemode
    // This ensures RLS allows the features to be visible during validation
    const livemodeToggleFeatureA = await setupToggleFeature({
      name: 'Livemode Feature A',
      organizationId: organization.id,
      livemode: true,
      pricingModelId: sourcePricingModel.id,
    })
    const livemodeToggleFeatureB = await setupToggleFeature({
      name: 'Livemode Feature B',
      organizationId: organization.id,
      livemode: true,
      pricingModelId: sourcePricingModel.id,
    })
    const toggleFeatureIds = [
      livemodeToggleFeatureA.id,
      livemodeToggleFeatureB.id,
    ]

    await expect(
      comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await createProductTransaction(
            {
              product: {
                name: 'Single Payment Product with Toggle Features',
                description: 'Test Description',
                active: true,
                imageURL: null,
                singularQuantityLabel: 'singular',
                pluralQuantityLabel: 'plural',
                pricingModelId: sourcePricingModel.id,
                default: false,
                slug: `flowglad-test-product+${core.nanoid()}`,
              },
              prices: [
                {
                  name: 'One-time Payment',
                  type: PriceType.SinglePayment,
                  intervalCount: null,
                  intervalUnit: null,
                  unitPrice: 9900,
                  trialPeriodDays: null,
                  active: true,
                  usageMeterId: null,
                  usageEventsPerUnit: null,
                  isDefault: true,
                  slug: `flowglad-test-price+${core.nanoid()}`,
                },
              ],
              featureIds: toggleFeatureIds,
            },
            params
          )
          return Result.ok(txResult)
        },
        {
          apiKey: org1ApiKeyToken,
        }
      )
    ).rejects.toThrow(
      'Cannot associate toggle features with single payment products. Toggle features require subscription-based pricing.'
    )
  })

  it('should allow creating a SinglePayment product with usage credit grant features', async () => {
    // Setup: Create a usage meter for the usage credit grant feature
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: sourcePricingModel.id,
      name: 'API Credits',
      slug: `api-credits-${core.nanoid()}`,
      livemode: false,
    })

    // Setup: Create a usage credit grant feature
    const usageCreditGrantFeature =
      await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: sourcePricingModel.id,
        name: 'API Credit Grant',
        usageMeterId: usageMeter.id,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: false,
        amount: 1000,
      })

    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await createProductTransaction(
          {
            product: {
              name: 'Single Payment Product with Credits',
              description:
                'Product that grants usage credits on purchase',
              active: true,
              imageURL: null,
              singularQuantityLabel: 'purchase',
              pluralQuantityLabel: 'purchases',
              pricingModelId: sourcePricingModel.id,
              default: false,
              slug: `flowglad-test-product+${core.nanoid()}`,
            },
            prices: [
              {
                name: 'Credit Bundle',
                type: PriceType.SinglePayment,
                intervalCount: null,
                intervalUnit: null,
                unitPrice: 4900,
                trialPeriodDays: null,
                active: true,
                usageMeterId: null,
                usageEventsPerUnit: null,
                isDefault: true,
                slug: `flowglad-test-price+${core.nanoid()}`,
              },
            ],
            featureIds: [usageCreditGrantFeature.id],
          },
          params
        )
        return Result.ok(txResult)
      },
      {
        apiKey: org1ApiKeyToken,
      }
    )

    const { product } = result
    expect(product.name).toBe('Single Payment Product with Credits')

    // Verify the usage credit grant feature was associated
    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(productFeatures).toHaveLength(1)
    expect(productFeatures[0].featureId).toBe(
      usageCreditGrantFeature.id
    )
  })
})

describe('editProductTransaction - Feature Updates', () => {
  let organization: Organization.Record
  let product: Product.Record
  let features: Feature.Record[]
  let userId: string
  let apiKeyToken: string

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    product = orgSetup.product

    const userApiKeyOrg = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeyOrg.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    userId = userApiKeyOrg.user.id
    apiKeyToken = userApiKeyOrg.apiKey.token

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
    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: { id: product.id, name: 'Updated Product' },
            featureIds,
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(productFeatures).toHaveLength(2)
    expect(productFeatures.map((pf) => pf.featureId).sort()).toEqual(
      featureIds.sort()
    )
  })

  it('should remove features from a product', async () => {
    // First, add features
    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: { id: product.id },
            featureIds: [features[0].id, features[1].id],
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    // Then, remove one
    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: { id: product.id },
            featureIds: [features[0].id],
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(
      productFeatures.filter((pf) => !pf.expiredAt)
    ).toHaveLength(1)
    expect(
      productFeatures.find((pf) => !pf.expiredAt)?.featureId
    ).toBe(features[0].id)
    expect(productFeatures.find((pf) => pf.expiredAt)).toMatchObject(
      {}
    )
  })

  it('should not change features if featureIds is not provided', async () => {
    // First, add features
    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: { id: product.id },
            featureIds: [features[0].id, features[1].id],
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    // Then, edit product without featureIds
    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: { id: product.id, name: 'New Name' },
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: product.id },
        ctx.transaction
      )
    })

    expect(
      productFeatures.filter((pf) => !pf.expiredAt)
    ).toHaveLength(2)
  })

  it('should throw an error when adding toggle features to a SinglePayment product', async () => {
    // Setup: Create a SinglePayment product
    const singlePaymentProduct = await setupProduct({
      organizationId: organization.id,
      livemode: true,
      pricingModelId: product.pricingModelId,
      name: 'Single Payment Product',
    })
    await setupPrice({
      productId: singlePaymentProduct.id,
      name: 'One-time Price',
      livemode: true,
      isDefault: true,
      type: PriceType.SinglePayment,
      unitPrice: 9900,
    })

    const toggleFeatureIds = [features[0].id]

    await expect(
      comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: { id: singlePaymentProduct.id },
              featureIds: toggleFeatureIds,
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )
    ).rejects.toThrow(
      'Cannot associate toggle features with single payment products. Toggle features require subscription-based pricing.'
    )
  })

  it('should allow adding usage credit grant features to a SinglePayment product', async () => {
    // Setup: Create a SinglePayment product
    const singlePaymentProduct = await setupProduct({
      organizationId: organization.id,
      livemode: true,
      pricingModelId: product.pricingModelId,
      name: 'Single Payment Product with Credits',
    })
    await setupPrice({
      productId: singlePaymentProduct.id,
      name: 'Credit Bundle Price',
      livemode: true,
      isDefault: true,
      type: PriceType.SinglePayment,
      unitPrice: 4900,
    })

    // Setup: Create a usage meter and usage credit grant feature
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: product.pricingModelId,
      name: 'API Credits Meter',
      slug: `api-credits-meter-${core.nanoid()}`,
      livemode: true,
    })

    const usageCreditGrantFeature =
      await setupUsageCreditGrantFeature({
        organizationId: organization.id,
        pricingModelId: product.pricingModelId,
        name: 'Credit Grant Feature',
        usageMeterId: usageMeter.id,
        renewalFrequency: FeatureUsageGrantFrequency.Once,
        livemode: true,
        amount: 500,
      })

    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: { id: singlePaymentProduct.id },
            featureIds: [usageCreditGrantFeature.id],
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    const productFeatures = await adminTransaction(async (ctx) => {
      return selectProductFeatures(
        { productId: singlePaymentProduct.id },
        ctx.transaction
      )
    })

    expect(
      productFeatures.filter((pf) => !pf.expiredAt)
    ).toHaveLength(1)
    expect(
      productFeatures.find((pf) => !pf.expiredAt)?.featureId
    ).toBe(usageCreditGrantFeature.id)
  })
})

describe('editProductTransaction - Price Updates', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string
  let defaultPriceId: string
  let regularProductId: string
  let regularPriceId: string
  let apiKeyToken: string
  const livemode = true

  beforeEach(async () => {
    // Set up organization and pricing model with default product
    const result = await setupOrg()

    organizationId = result.organization.id
    pricingModelId = result.pricingModel.id
    defaultProductId = result.product.id
    defaultPriceId = result.price.id

    // Create a regular (non-default) product and price for testing
    const regularSetup = await adminTransaction(async (ctx) => {
      const product = await setupProduct({
        organizationId,
        livemode,
        pricingModelId,
        name: 'Regular Product',
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Regular Price',
        livemode,
        isDefault: true,
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
      })
      return { product, price }
    })

    regularProductId = regularSetup.product.id
    regularPriceId = regularSetup.price.id

    // Set up API key for authenticated transaction
    const { apiKey } = await setupUserAndApiKey({
      organizationId,
      livemode,
    })
    if (!apiKey.token) {
      throw new Error('API key token not found')
    }
    apiKeyToken = apiKey.token
  })

  it('should silently ignore price updates when editing default products', async () => {
    const currentPrice = await adminTransaction(async (ctx) => {
      return (
        await selectPriceById(defaultPriceId, ctx.transaction)
      ).unwrap()
    })
    if (!currentPrice) {
      throw new Error('Default price not found')
    }

    const initialPriceCount = await adminTransaction(async (ctx) => {
      const prices = await selectPrices(
        { productId: defaultProductId },
        ctx.transaction
      )
      return prices.length
    })

    // Create a modified price by changing immutable fields from the existing price
    const modifiedPrice: Price.ClientInsert = {
      productId: defaultProductId,
      type: PriceType.Subscription,
      unitPrice: currentPrice.unitPrice + 1000, // Increment unit price (immutable field)
      intervalUnit:
        currentPrice.intervalUnit === IntervalUnit.Month
          ? IntervalUnit.Year
          : IntervalUnit.Month, // Change interval unit (immutable field)
      intervalCount: currentPrice.intervalCount ?? 1,
      isDefault: currentPrice.isDefault,
      name: currentPrice.name ?? undefined,
      trialPeriodDays: currentPrice.trialPeriodDays ?? undefined,
      usageEventsPerUnit: null,
      usageMeterId: null,
      active: currentPrice.active,
    }

    // Should succeed without error - price updates are silently ignored for default products
    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: {
              id: defaultProductId,
              name: 'Updated Name',
              active: true,
              default: true,
            },
            price: modifiedPrice,
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    // Verify product was updated successfully
    expect(result.name).toBe('Updated Name')
    expect(result.default).toBe(true)

    // Verify no new price was created - price updates are ignored for default products
    const finalPriceCount = await adminTransaction(async (ctx) => {
      const prices = await selectPrices(
        { productId: defaultProductId },
        ctx.transaction
      )
      return prices.length
    })
    expect(finalPriceCount).toBe(initialPriceCount)

    // Verify the original price was not modified
    const priceAfterUpdate = await adminTransaction(async (ctx) => {
      return (
        await selectPriceById(defaultPriceId, ctx.transaction)
      ).unwrap()
    })
    expect(priceAfterUpdate?.unitPrice).toBe(currentPrice.unitPrice)
    expect(priceAfterUpdate?.intervalUnit).toBe(
      currentPrice.intervalUnit
    )
    expect(priceAfterUpdate?.id).toBe(currentPrice.id)
    expect(priceAfterUpdate?.type).toBe(currentPrice.type)
  })

  it('should allow updating allowed fields on default products', async () => {
    const result = await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: {
              id: defaultProductId,
              name: 'Updated Base Plan Name',
              description: 'Updated description',
              active: true,
              default: true,
            },
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    expect(result).toMatchObject({})
    expect(result.name).toBe('Updated Base Plan Name')
    expect(result.description).toBe('Updated description')
    expect(result.default).toBe(true)
  })

  it('should insert new price record when price immutable fields are updated on non-default products', async () => {
    // Get initial price count
    const initialPrices = await adminTransaction(async (ctx) => {
      return await selectPrices(
        { productId: regularProductId },
        ctx.transaction
      )
    })
    const initialPriceCount = initialPrices.length

    // Get the current default price
    const currentPrice = await adminTransaction(async (ctx) => {
      return (
        await selectPriceById(regularPriceId, ctx.transaction)
      ).unwrap()
    })
    if (!currentPrice) {
      throw new Error('Regular price not found')
    }

    // Create a modified price with changed immutable fields
    const modifiedPrice: Price.ClientInsert = {
      productId: regularProductId,
      type: PriceType.Subscription,
      unitPrice: currentPrice.unitPrice + 2000, // Change immutable field
      intervalUnit:
        currentPrice.intervalUnit === IntervalUnit.Month
          ? IntervalUnit.Year
          : IntervalUnit.Month, // Change immutable field
      intervalCount: currentPrice.intervalCount ?? 1,
      isDefault: currentPrice.isDefault,
      name: currentPrice.name ?? undefined,
      trialPeriodDays: currentPrice.trialPeriodDays ?? undefined,
      usageEventsPerUnit: null,
      usageMeterId: null,
      active: currentPrice.active,
    }

    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: {
              id: regularProductId,
              name: 'Updated Regular Product',
              active: true,
              default: false,
            },
            price: modifiedPrice,
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    // Verify a new price was inserted
    const finalPrices = await adminTransaction(async (ctx) => {
      return await selectPrices(
        { productId: regularProductId },
        ctx.transaction
      )
    })
    const finalPriceCount = finalPrices.length

    expect(finalPriceCount).toBe(initialPriceCount + 1)
    expect(
      finalPrices.some((p) => p.unitPrice === modifiedPrice.unitPrice)
    ).toBe(true)
    expect(
      finalPrices.some(
        (p) => p.intervalUnit === modifiedPrice.intervalUnit
      )
    ).toBe(true)
  })

  it('should not insert new price record when no important price fields are updated', async () => {
    // Get initial price count
    const initialPrices = await adminTransaction(async (ctx) => {
      return await selectPrices(
        { productId: regularProductId },
        ctx.transaction
      )
    })
    const initialPriceCount = initialPrices.length

    // Get the current default price
    const currentPrice = await adminTransaction(async (ctx) => {
      return (
        await selectPriceById(regularPriceId, ctx.transaction)
      ).unwrap()
    })

    if (!currentPrice) {
      throw new Error('Regular price not found')
    }

    // Create a modified price with only non-immutable fields changed
    // (name, active, isDefault are not immutable)
    const modifiedPrice: Price.ClientInsert = {
      productId: regularProductId,
      type: PriceType.Subscription,
      unitPrice: currentPrice.unitPrice, // Same - immutable field unchanged
      intervalUnit: currentPrice.intervalUnit ?? IntervalUnit.Month, // Same - immutable field unchanged
      intervalCount: currentPrice.intervalCount ?? 1, // Same - immutable field unchanged
      isDefault: currentPrice.isDefault,
      name: currentPrice.name ?? null, // Same - non-immutable field
      trialPeriodDays: currentPrice.trialPeriodDays ?? null,
      usageEventsPerUnit: null,
      usageMeterId: null,
      active: currentPrice.active, // Same - non-immutable field
      slug: currentPrice.slug ?? null, // Same - preserve slug
    }

    await comprehensiveAuthenticatedTransaction(
      async (params) => {
        const txResult = await editProductTransaction(
          {
            product: {
              id: regularProductId,
              name: 'Updated Regular Product',
              active: true,
              default: false,
            },
            price: modifiedPrice,
          },
          params
        )
        return Result.ok(txResult)
      },
      { apiKey: apiKeyToken }
    )

    // Verify no new price was inserted
    const finalPrices = await adminTransaction(async (ctx) => {
      return await selectPrices(
        { productId: regularProductId },
        ctx.transaction
      )
    })
    const finalPriceCount = finalPrices.length

    expect(finalPriceCount).toBe(initialPriceCount)
  })
})

describe('editProductTransaction - Product Slug to Price Slug Sync', () => {
  let organizationId: string
  let pricingModelId: string
  let defaultProductId: string
  let defaultPriceId: string
  let regularProductId: string
  let regularPriceId: string
  let apiKeyToken: string
  const livemode = true

  beforeEach(async () => {
    // Set up organization and pricing model with default product
    const result = await setupOrg()

    organizationId = result.organization.id
    pricingModelId = result.pricingModel.id
    defaultProductId = result.product.id
    defaultPriceId = result.price.id

    // Create a regular (non-default) product and price for testing
    const regularSetup = await adminTransaction(async (ctx) => {
      const product = await setupProduct({
        organizationId,
        livemode,
        pricingModelId,
        name: 'Regular Product',
        slug: 'old-product-slug',
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Regular Price',
        livemode,
        isDefault: true,
        type: PriceType.Subscription,
        unitPrice: 5000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        slug: 'old-price-slug',
      })
      return { product, price }
    })

    regularProductId = regularSetup.product.id
    regularPriceId = regularSetup.price.id

    // Set up API key for authenticated transaction
    const { apiKey } = await setupUserAndApiKey({
      organizationId,
      livemode,
    })
    if (!apiKey.token) {
      throw new Error('API key token not found')
    }
    apiKeyToken = apiKey.token
  })

  describe('when product slug is mutating', () => {
    it('should update active default price slug when no price input is provided', async () => {
      // Update product with new slug, no price input
      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: regularProductId,
                name: 'Updated Regular Product',
                slug: 'new-product-slug',
                active: true,
                default: false,
              },
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product slug is updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('new-product-slug')

      // Verify active default price slug is updated
      const updatedPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedPrice?.slug).toBe('new-product-slug')

      // Verify no new price record is created
      const finalPrices = await adminTransaction(async (ctx) => {
        return await selectPrices(
          { productId: regularProductId },
          ctx.transaction
        )
      })
      expect(finalPrices.length).toBe(1)
    })

    it('should set new price slug to product slug when price input is provided', async () => {
      const currentPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      if (!currentPrice) {
        throw new Error('Price not found')
      }

      // Update product with new slug AND provide price input with different slug
      const modifiedPrice: Price.ClientInsert = {
        productId: regularProductId,
        type: PriceType.Subscription,
        unitPrice: currentPrice.unitPrice + 2000, // Change immutable field to trigger insertion
        intervalUnit: currentPrice.intervalUnit ?? IntervalUnit.Month,
        intervalCount: currentPrice.intervalCount ?? 1,
        isDefault: currentPrice.isDefault,
        name: currentPrice.name ?? undefined,
        trialPeriodDays: currentPrice.trialPeriodDays ?? undefined,
        usageEventsPerUnit: null,
        usageMeterId: null,
        active: currentPrice.active,
        slug: 'different-slug', // This should be overridden
      }

      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: regularProductId,
                name: 'Updated Regular Product',
                slug: 'new-product-slug',
                active: true,
                default: false,
              },
              price: modifiedPrice,
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product slug is updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('new-product-slug')

      // Verify new price is inserted with product slug (not the slug from price input)
      const finalPrices = await adminTransaction(async (ctx) => {
        return await selectPrices(
          { productId: regularProductId },
          ctx.transaction
        )
      })
      const newPrice = finalPrices.find(
        (p) => p.unitPrice === modifiedPrice.unitPrice
      )
      expect(newPrice?.slug).toBe('new-product-slug')
    })

    it('should not update price slug when product slug is not changing', async () => {
      // Update product name but keep same slug, no price input
      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: regularProductId,
                name: 'Updated Product Name',
                slug: 'old-product-slug', // Same slug
                active: true,
                default: false,
              },
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product name is updated but slug remains same
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.name).toBe('Updated Product Name')
      expect(updatedProduct?.slug).toBe('old-product-slug')

      // Verify price slug remains unchanged
      const updatedPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedPrice?.slug).toBe('old-price-slug')

      // Verify no new price record is created
      const finalPrices = await adminTransaction(async (ctx) => {
        return await selectPrices(
          { productId: regularProductId },
          ctx.transaction
        )
      })
      expect(finalPrices.length).toBe(1)
    })

    it('should handle slug update when product has multiple prices', async () => {
      // Create an inactive price (must use insertPrice directly since safelyInsertPrice always creates active prices)
      const inactivePrice = await adminTransaction(async (ctx) => {
        const organization = (
          await selectOrganizationById(
            organizationId,
            ctx.transaction
          )
        ).unwrap()
        return await insertPrice(
          {
            productId: regularProductId,
            name: 'Inactive Price',
            livemode,
            isDefault: false,
            active: false,
            type: PriceType.Subscription,
            unitPrice: 3000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            slug: 'inactive-price-slug',
            currency: organization.defaultCurrency,
            externalId: null,
            usageEventsPerUnit: null,
            usageMeterId: null,
          },
          ctx
        )
      })

      // Update product slug
      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: regularProductId,
                name: 'Updated Regular Product',
                slug: 'new-slug',
                active: true,
                default: false,
              },
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product slug is updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('new-slug')

      // Verify active default price slug is updated
      const updatedActivePrice = await adminTransaction(
        async (ctx) => {
          return (
            await selectPriceById(regularPriceId, ctx.transaction)
          ).unwrap()
        }
      )
      expect(updatedActivePrice?.slug).toBe('new-slug')

      // Verify inactive price slug remains unchanged
      const updatedInactivePrice = await adminTransaction(
        async (ctx) => {
          return (
            await selectPriceById(inactivePrice.id, ctx.transaction)
          ).unwrap()
        }
      )
      expect(updatedInactivePrice?.slug).toBe('inactive-price-slug')
    })

    it('should respect price slug uniqueness constraint', async () => {
      // Create another product in the same pricing model with a price that has a slug
      const otherProduct = await adminTransaction(async (ctx) => {
        const product = await setupProduct({
          organizationId,
          livemode,
          pricingModelId,
          name: 'Other Product',
          slug: 'other-product',
        })
        const price = await setupPrice({
          productId: product.id,
          name: 'Other Price',
          livemode,
          isDefault: true,
          type: PriceType.Subscription,
          unitPrice: 6000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          slug: 'target-slug',
        })
        return { product, price }
      })

      // Try to update product slug to conflict with existing price slug
      await expect(
        comprehensiveAuthenticatedTransaction(
          async (params) => {
            const txResult = await editProductTransaction(
              {
                product: {
                  id: regularProductId,
                  name: 'Updated Regular Product',
                  slug: 'target-slug', // This conflicts with other product's price slug
                  active: true,
                  default: false,
                },
              },
              params
            )
            return Result.ok(txResult)
          },
          { apiKey: apiKeyToken }
        )
      ).rejects.toThrow()

      // Verify product slug was not updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('old-product-slug')

      // Verify price slug was not updated
      const updatedPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedPrice?.slug).toBe('old-price-slug')
    })

    it('should not sync slug for default products', async () => {
      // Use the default product from setupOrg (already exists in beforeEach)
      // Try to update default product slug (should be blocked by existing validation)
      await expect(
        comprehensiveAuthenticatedTransaction(
          async (params) => {
            const txResult = await editProductTransaction(
              {
                product: {
                  id: defaultProductId,
                  name: 'Updated Default Product',
                  slug: 'new-default-slug',
                  active: true,
                  default: true,
                },
              },
              params
            )
            return Result.ok(txResult)
          },
          { apiKey: apiKeyToken }
        )
      ).rejects.toThrow()

      // Verify product slug was not updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(defaultProductId, ctx.transaction)
        ).unwrap()
      })
      // The default product from setupOrg doesn't have a slug initially, so we just verify it wasn't set
      expect(updatedProduct?.slug).not.toBe('new-default-slug')

      // Verify price slug was not updated
      const updatedPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(defaultPriceId, ctx.transaction)
        ).unwrap()
      })
      // Verify the price slug remains unchanged (or null if it was null)
      expect(updatedPrice?.slug).not.toBe('new-default-slug')
    })

    it('should sync slug when product slug changes from null to a value', async () => {
      // Create product with null slug
      const productWithNullSlug = await adminTransaction(
        async (ctx) => {
          return await setupProduct({
            organizationId,
            livemode,
            pricingModelId,
            name: 'Product Without Slug',
            slug: undefined,
          })
        }
      )

      const priceWithSlug = await adminTransaction(async (ctx) => {
        return await setupPrice({
          productId: productWithNullSlug.id,
          name: 'Price',
          livemode,
          isDefault: true,
          type: PriceType.Subscription,
          unitPrice: 4000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          slug: 'existing-price-slug',
        })
      })

      // Update product slug from null to a value
      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: productWithNullSlug.id,
                name: 'Product Without Slug',
                slug: 'new-product-slug',
                active: true,
                default: false,
              },
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product slug is updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(
            productWithNullSlug.id,
            ctx.transaction
          )
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('new-product-slug')

      // Verify active default price slug is updated
      const updatedPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(priceWithSlug.id, ctx.transaction)
        ).unwrap()
      })
      expect(updatedPrice?.slug).toBe('new-product-slug')
    })

    it('should sync slug when price input causes new price insertion', async () => {
      const currentPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      if (!currentPrice) {
        throw new Error('Price not found')
      }

      // Update product slug AND provide price input that changes immutable fields
      const modifiedPrice: Price.ClientInsert = {
        productId: regularProductId,
        type: PriceType.Subscription,
        unitPrice: currentPrice.unitPrice + 3000, // Change immutable field
        intervalUnit: currentPrice.intervalUnit ?? IntervalUnit.Month,
        intervalCount: currentPrice.intervalCount ?? 1,
        isDefault: currentPrice.isDefault,
        name: currentPrice.name ?? undefined,
        trialPeriodDays: currentPrice.trialPeriodDays ?? undefined,
        usageEventsPerUnit: null,
        usageMeterId: null,
        active: currentPrice.active,
      }

      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: regularProductId,
                name: 'Updated Regular Product',
                slug: 'new-slug',
                active: true,
                default: false,
              },
              price: modifiedPrice,
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product slug is updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('new-slug')

      // Verify new price is inserted with product slug
      const finalPrices = await adminTransaction(async (ctx) => {
        return await selectPrices(
          { productId: regularProductId },
          ctx.transaction
        )
      })
      const newPrice = finalPrices.find(
        (p) => p.unitPrice === modifiedPrice.unitPrice
      )
      expect(newPrice).toMatchObject({ slug: 'new-slug' })
      expect(newPrice?.slug).toBe('new-slug')
    })

    it('should update existing price slug when price input does not cause new price insertion', async () => {
      const currentPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      if (!currentPrice) {
        throw new Error('Price not found')
      }

      // Update product slug AND provide price input that does NOT change immutable fields or other important fields
      const modifiedPrice: Price.ClientInsert = {
        productId: regularProductId,
        type: PriceType.Subscription,
        unitPrice: currentPrice.unitPrice, // Same - immutable field unchanged
        intervalUnit: currentPrice.intervalUnit ?? IntervalUnit.Month, // Same
        intervalCount: currentPrice.intervalCount ?? 1, // Same
        isDefault: currentPrice.isDefault,
        name: currentPrice.name ?? null, // Same - no change
        trialPeriodDays: currentPrice.trialPeriodDays ?? undefined,
        usageEventsPerUnit: null,
        usageMeterId: null,
        active: currentPrice.active,
        // Note: slug is not provided, but will be synced to product slug if product slug changes
      }

      await comprehensiveAuthenticatedTransaction(
        async (params) => {
          const txResult = await editProductTransaction(
            {
              product: {
                id: regularProductId,
                name: 'Updated Regular Product',
                slug: 'new-slug',
                active: true,
                default: false,
              },
              price: modifiedPrice,
            },
            params
          )
          return Result.ok(txResult)
        },
        { apiKey: apiKeyToken }
      )

      // Verify product slug is updated
      const updatedProduct = await adminTransaction(async (ctx) => {
        return (
          await selectProductById(regularProductId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedProduct?.slug).toBe('new-slug')

      // Verify no new price was inserted
      const finalPrices = await adminTransaction(async (ctx) => {
        return await selectPrices(
          { productId: regularProductId },
          ctx.transaction
        )
      })
      expect(finalPrices.length).toBe(1)

      // Verify existing active price slug is updated
      const updatedPrice = await adminTransaction(async (ctx) => {
        return (
          await selectPriceById(regularPriceId, ctx.transaction)
        ).unwrap()
      })
      expect(updatedPrice?.slug).toBe('new-slug')
    })
  })
})
