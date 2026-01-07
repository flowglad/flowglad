import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupOrg,
  setupPrice,
  setupProduct,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import { selectPrices } from '@/db/tableMethods/priceMethods'
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
    it('creates usage meter and price with matching slugs (no product)', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      // Verify usage meter properties
      expect(result.usageMeter.name).toBe('API Calls')
      expect(result.usageMeter.slug).toBe('api-calls')
      expect(result.usageMeter.pricingModelId).toBe(pricingModel.id)
      expect(result.usageMeter.organizationId).toBe(organization.id)

      // Verify price properties - usage prices have productId: null
      expect(result.price.name).toBe('API Calls')
      expect(result.price.slug).toBe('api-calls') // Same slug as usage meter
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.unitPrice).toBe(0) // $0.00 as specified
      expect(result.price.usageMeterId).toBe(result.usageMeter.id)
      expect(result.price.productId).toBeNull() // Usage prices don't have products
      expect(result.price.pricingModelId).toBe(pricingModel.id)
      expect(result.price.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.price.intervalCount).toBe(1)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.isDefault).toBe(true)
      expect(result.price.active).toBe(true)
      expect(result.price.currency).toBe(organization.defaultCurrency)
    })

    it('creates usage meter with aggregationType', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      expect(result.usageMeter.aggregationType).toBe(
        UsageMeterAggregationType.CountDistinctProperties
      )
    })
  })

  describe('Usage meter slug collision', () => {
    it('fails and rolls back when usage meter slug already exists in pricing model', async () => {
      const slug = 'duplicate-usage-meter-slug'

      // Create a usage meter with the slug first
      await setupUsageMeter({
        organizationId: organization.id,
        name: 'Existing Usage Meter',
        slug,
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      // Attempt to create usage meter with the same slug
      await expect(
        adminTransaction(async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        })
      ).rejects.toThrow()

      // Verify only the original usage meter exists (transaction rolled back)
      const usageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(usageMeters).toHaveLength(1)
      expect(usageMeters[0].name).toBe('Existing Usage Meter')
    })
  })

  describe('Price slug collision', () => {
    it('allows usage meter creation with same slug as existing product price (separate namespaces)', async () => {
      const slug = 'shared-slug'

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

      // Create usage meter with the same slug - this should succeed
      // because usage prices and product prices have separate namespaces
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      // Verify both were created
      expect(result.usageMeter.slug).toBe(slug)
      expect(result.price.slug).toBe(slug)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()

      // Verify we now have both prices with the same slug in the pricing model
      const pricesWithSlug = await adminTransaction(
        async ({ transaction }) => {
          return selectPrices(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(pricesWithSlug).toHaveLength(2)
      const subscriptionPrice = pricesWithSlug.find(
        (p) => p.type === PriceType.Subscription
      )
      const usagePrice = pricesWithSlug.find(
        (p) => p.type === PriceType.Usage
      )
      expect(subscriptionPrice).not.toBeUndefined()
      expect(usagePrice).not.toBeUndefined()
    })

    it('allows usage meter creation with unique slug even when other slugs exist', async () => {
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
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      expect(result.usageMeter.slug).toBe(slug)
      expect(result.price.slug).toBe(slug)
      expect(result.price.productId).toBeNull()
      expect(result.price.active).toBe(true)
    })
  })

  describe('Transaction rollback verification', () => {
    it('does not create any records when slug collision occurs', async () => {
      const slug = 'collision-test-slug'

      // Create a usage meter with the slug first
      await setupUsageMeter({
        organizationId: organization.id,
        name: 'Blocking Usage Meter',
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
          const allPrices = await selectPrices(
            { pricingModelId: pricingModel.id },
            transaction
          )
          return {
            usageMeters: usageMeters.length,
            prices: allPrices.length,
          }
        }
      )

      // Attempt to create usage meter (should fail due to slug collision)
      await expect(
        adminTransaction(async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        })
      ).rejects.toThrow()

      // Count records after the failed transaction
      const afterCounts = await adminTransaction(
        async ({ transaction }) => {
          const usageMeters = await selectUsageMeters(
            { pricingModelId: pricingModel.id },
            transaction
          )
          const allPrices = await selectPrices(
            { pricingModelId: pricingModel.id },
            transaction
          )
          return {
            usageMeters: usageMeters.length,
            prices: allPrices.length,
          }
        }
      )

      // Verify no new records were created (transaction rolled back completely)
      expect(afterCounts.usageMeters).toBe(beforeCounts.usageMeters)
      expect(afterCounts.prices).toBe(beforeCounts.prices)
    })
  })

  describe('Custom price fields', () => {
    it('creates usage meter with custom unitPrice and usageEventsPerUnit', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      // Verify price has custom values
      expect(result.price.unitPrice).toBe(1000)
      expect(result.price.usageEventsPerUnit).toBe(100)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
    })

    it('creates usage meter without price values (use defaults)', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      // Verify price uses defaults
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
    })

    it('respects custom unitPrice when usageEventsPerUnit is not provided', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
        }
      )

      // Verify custom unitPrice is used, default usageEventsPerUnit
      expect(result.price.unitPrice).toBe(500)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.productId).toBeNull()
    })
  })
})
