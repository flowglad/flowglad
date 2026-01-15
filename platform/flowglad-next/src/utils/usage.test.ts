import { Result } from 'better-result'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupOrg,
  setupPrice,
  setupProduct,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import {
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import { createUsageMeterTransaction } from './usage'

describe('createUsageMeterTransaction', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let userId: string

  beforeEach(async () => {
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    pricingModel = orgSetup.pricingModel

    // Create a user for the organization
    const userSetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: false,
    })
    userId = userSetup.user.id
  })

  describe('Successful creation', () => {
    it('should create usage meter, product, and price with matching slugs', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'API Calls',
                slug: 'api-calls',
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify all three records were created with expected properties
      // Verify usage meter properties
      expect(result.usageMeter.name).toBe('API Calls')
      expect(result.usageMeter.slug).toBe('api-calls')
      expect(result.usageMeter.pricingModelId).toBe(pricingModel.id)
      expect(result.usageMeter.organizationId).toBe(organization.id)

      // Verify product properties
      expect(result.product.name).toBe('API Calls')
      expect(result.product.slug).toBe('api-calls') // Same slug as usage meter
      expect(result.product.pricingModelId).toBe(pricingModel.id)
      // Note: organizationId comes from user's focused membership in createProductTransaction
      expect(typeof result.product.organizationId).toBe('string')
      expect(result.product.default).toBe(false)
      expect(result.product.active).toBe(true)

      // Verify price properties
      expect(result.price.slug).toBe('api-calls') // Same slug as usage meter
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.unitPrice).toBe(0) // $0.00 as specified
      expect(result.price.usageMeterId).toBe(result.usageMeter.id)
      expect(result.price.productId).toBe(result.product.id)
      expect(result.price.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.price.intervalCount).toBe(1)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.isDefault).toBe(true)
      expect(result.price.active).toBe(true)
      expect(result.price.currency).toBe(organization.defaultCurrency)
    })

    it('should create usage meter with aggregationType', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Unique Users',
                slug: 'unique-users',
                pricingModelId: pricingModel.id,
                aggregationType:
                  UsageMeterAggregationType.CountDistinctProperties,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.usageMeter.aggregationType).toBe(
        UsageMeterAggregationType.CountDistinctProperties
      )
    })
  })

  describe('Product slug collision', () => {
    it('should fail and rollback when product slug already exists in pricing model', async () => {
      const slug = 'duplicate-product-slug'

      // Create a product with the slug first
      await setupProduct({
        organizationId: organization.id,
        name: 'Existing Product',
        slug,
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      // Attempt to create usage meter with the same slug
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'New Usage Meter',
                slug,
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        })
      ).rejects.toThrow()

      // Verify no usage meter was created (transaction rolled back)
      const usageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(usageMeters).toHaveLength(0)

      // Verify only the original product exists
      const products = await adminTransaction(
        async ({ transaction }) => {
          return selectProducts(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(products).toHaveLength(1)
      expect(products[0].name).toBe('Existing Product')

      // Verify no usage price was created (the failed transaction tried to create a usage price)
      const prices = await adminTransaction(
        async ({ transaction }) => {
          return selectPrices({ slug }, transaction)
        }
      )
      const usagePrices = prices.filter(
        (p) => p.type === PriceType.Usage
      )
      expect(usagePrices).toHaveLength(0)
    })
  })

  describe('Price slug collision', () => {
    it('should fail and rollback when price slug already exists as an active price in pricing model', async () => {
      const slug = 'duplicate-price-slug'

      // Create a product and price with the slug first
      const existingProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Existing Product',
        slug: 'other-product',
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      await setupPrice({
        productId: existingProduct.id,
        name: 'Existing Price',
        slug,
        unitPrice: 1000,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        active: true,
        isDefault: true,
        livemode: false,
      })

      // Attempt to create usage meter with the same slug
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'New Usage Meter',
                slug,
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        })
      ).rejects.toThrow()

      // Verify no usage meter was created (transaction rolled back)
      const usageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(usageMeters).toHaveLength(0)

      // Verify no new product was created with the usage meter's slug
      const products = await adminTransaction(
        async ({ transaction }) => {
          return selectProducts(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(products).toHaveLength(0)

      // Verify the original price still exists and no usage price was created
      const pricesWithSlug = await adminTransaction(
        async ({ transaction }) => {
          return selectPrices({ slug }, transaction)
        }
      )
      // Should have at least the original price
      expect(pricesWithSlug.length).toBeGreaterThanOrEqual(1)
      // Verify none of them are usage prices (the failed transaction tried to create a usage price)
      const usagePrices = pricesWithSlug.filter(
        (p) => p.type === PriceType.Usage
      )
      expect(usagePrices).toHaveLength(0)
    })

    it('should allow usage meter creation with unique slug even when other slugs exist', async () => {
      const slug = 'unique-new-slug'

      // Create a product and price with a DIFFERENT slug
      const existingProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Existing Product',
        slug: 'different-product-slug',
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      await setupPrice({
        productId: existingProduct.id,
        name: 'Existing Price',
        slug: 'different-price-slug',
        unitPrice: 1000,
        type: PriceType.Subscription,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        active: true,
        isDefault: true,
        livemode: false,
      })

      // Should succeed because the slug is unique
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'New Usage Meter',
                slug,
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.usageMeter.slug).toBe(slug)
      expect(result.product.slug).toBe(slug)
      expect(result.price.slug).toBe(slug)
      expect(result.price.active).toBe(true)
    })
  })

  describe('Transaction rollback verification', () => {
    it('should not create any records when slug collision occurs', async () => {
      const slug = 'collision-test-slug'

      // Create a product with the slug first
      const blockingProduct = await setupProduct({
        organizationId: organization.id,
        name: 'Blocking Product',
        slug,
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      // Count records before the failed transaction
      const beforeCounts = await adminTransaction(
        async ({ transaction }) => {
          const usageMeters = await selectUsageMeters(
            { pricingModelId: pricingModel.id },
            transaction
          )
          const products = await selectProducts(
            { pricingModelId: pricingModel.id },
            transaction
          )
          const allPrices = await Promise.all(
            products.map((p) =>
              selectPrices({ productId: p.id }, transaction)
            )
          )
          const prices = allPrices.flat()
          return {
            usageMeters: usageMeters.length,
            products: products.length,
            prices: prices.length,
          }
        }
      )

      // Attempt to create usage meter (should fail due to product slug collision)
      await expect(
        comprehensiveAdminTransaction(async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Should Not Create',
                slug,
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        })
      ).rejects.toThrow()

      // Count records after the failed transaction
      const afterCounts = await adminTransaction(
        async ({ transaction }) => {
          const usageMeters = await selectUsageMeters(
            { pricingModelId: pricingModel.id },
            transaction
          )
          const products = await selectProducts(
            { pricingModelId: pricingModel.id },
            transaction
          )
          const allPrices = await Promise.all(
            products.map((p) =>
              selectPrices({ productId: p.id }, transaction)
            )
          )
          const prices = allPrices.flat()
          return {
            usageMeters: usageMeters.length,
            products: products.length,
            prices: prices.length,
          }
        }
      )

      // Verify no new records were created (transaction rolled back completely)
      expect(afterCounts.usageMeters).toBe(beforeCounts.usageMeters)
      expect(afterCounts.products).toBe(beforeCounts.products)
      expect(afterCounts.prices).toBe(beforeCounts.prices)
    })
  })

  describe('Custom price fields', () => {
    it('should create usage meter with custom unitPrice and usageEventsPerUnit', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Custom Price API Calls',
                slug: 'custom-price-api-calls',
                pricingModelId: pricingModel.id,
              },
              price: {
                unitPrice: 1000, // $10.00
                usageEventsPerUnit: 100,
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify price has custom values
      expect(result.price.unitPrice).toBe(1000)
      expect(result.price.usageEventsPerUnit).toBe(100)
      expect(result.price.type).toBe(PriceType.Usage)
    })

    it('should create usage meter without price values (use defaults)', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Default Price API Calls',
                slug: 'default-price-api-calls',
                pricingModelId: pricingModel.id,
              },
              // No price field provided
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify price uses defaults
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.type).toBe(PriceType.Usage)
    })

    it('should respect custom unitPrice when usageEventsPerUnit is not provided', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Partial Custom Price',
                slug: 'partial-custom-price',
                pricingModelId: pricingModel.id,
              },
              price: {
                unitPrice: 500, // $5.00
              },
            },
            {
              transaction,
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify custom unitPrice is used, default usageEventsPerUnit
      expect(result.price.unitPrice).toBe(500)
      expect(result.price.usageEventsPerUnit).toBe(1)
    })
  })
})
