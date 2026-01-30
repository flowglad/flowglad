import { beforeEach, describe, expect, it } from 'bun:test'
import {
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import { Result } from 'better-result'
import {
  setupOrg,
  setupPrice,
  setupProduct,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
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
    it('creates usage meter and no_charge price when no custom price values provided', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify usage meter properties
      expect(result.usageMeter.name).toBe('API Calls')
      expect(result.usageMeter.slug).toBe('api-calls')
      expect(result.usageMeter.pricingModelId).toBe(pricingModel.id)
      expect(result.usageMeter.organizationId).toBe(organization.id)

      // When no custom values provided, price and noChargePrice are the same object
      expect(result.price.id).toBe(result.noChargePrice.id)

      // Verify no_charge price properties
      expect(result.price.name).toBe('API Calls - No Charge')
      expect(result.price.slug).toBe('api-calls_no_charge')
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.usageMeterId).toBe(result.usageMeter.id)
      expect(result.price.productId).toBeNull()
      expect(result.price.pricingModelId).toBe(pricingModel.id)
      expect(result.price.intervalUnit).toBe(IntervalUnit.Month)
      expect(result.price.intervalCount).toBe(1)
      expect(result.price.usageEventsPerUnit).toBe(1)
      // No-charge price is default when no user price is specified
      expect(result.price.isDefault).toBe(true)
      expect(result.price.active).toBe(true)
      expect(result.price.currency).toBe(organization.defaultCurrency)
    })

    it('creates usage meter with aggregationType', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.usageMeter.aggregationType).toBe(
        UsageMeterAggregationType.CountDistinctProperties
      )
      // No-charge price should still be created
      expect(result.noChargePrice.slug).toBe('unique-users_no_charge')
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
        comprehensiveAdminTransaction(
          async ({
            transaction,
            invalidateCache,
            cacheRecomputationContext,
          }) => {
            const usageMeterResult =
              await createUsageMeterTransaction(
                {
                  usageMeter: {
                    name: 'New Usage Meter',
                    slug,
                    pricingModelId: pricingModel.id,
                  },
                },
                {
                  transaction,
                  cacheRecomputationContext,
                  livemode: false,
                  organizationId: organization.id,
                  invalidateCache,
                }
              )
            return Result.ok(usageMeterResult)
          }
        )
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

      // Create usage meter with the same slug - should succeed since
      // usage meter prices and product prices are in separate namespaces
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify usage meter was created successfully
      expect(result.usageMeter.slug).toBe(slug)
      expect(result.usageMeter.name).toBe('New Usage Meter')

      // Verify the no_charge price was created
      expect(result.noChargePrice.slug).toBe(`${slug}_no_charge`)

      // Verify both the product price and usage meter price exist with same slug
      const usageMeters = await adminTransaction(
        async ({ transaction }) => {
          return selectUsageMeters(
            { slug, pricingModelId: pricingModel.id },
            transaction
          )
        }
      )
      expect(usageMeters).toHaveLength(1)
      expect(usageMeters[0].slug).toBe(slug)
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
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.usageMeter.slug).toBe(slug)
      // When no custom values, price is the no_charge price
      expect(result.price.slug).toBe(`${slug}_no_charge`)
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
        comprehensiveAdminTransaction(
          async ({
            transaction,
            invalidateCache,
            cacheRecomputationContext,
          }) => {
            const usageMeterResult =
              await createUsageMeterTransaction(
                {
                  usageMeter: {
                    name: 'Should Not Create',
                    slug,
                    pricingModelId: pricingModel.id,
                  },
                },
                {
                  transaction,
                  cacheRecomputationContext,
                  livemode: false,
                  organizationId: organization.id,
                  invalidateCache,
                }
              )
            return Result.ok(usageMeterResult)
          }
        )
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
    it('creates both custom price and no_charge price when custom values provided', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify custom price has user-specified values
      expect(result.price.unitPrice).toBe(1000)
      expect(result.price.usageEventsPerUnit).toBe(100)
      expect(result.price.slug).toBe('custom-price-api-calls')
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
      expect(result.price.isDefault).toBe(true) // User price is default

      // Verify no_charge price was also created
      expect(result.noChargePrice.id).not.toBe(result.price.id)
      expect(result.noChargePrice.slug).toBe(
        'custom-price-api-calls_no_charge'
      )
      expect(result.noChargePrice.unitPrice).toBe(0)
      expect(result.noChargePrice.usageEventsPerUnit).toBe(1)
      expect(result.noChargePrice.isDefault).toBe(false) // No-charge is not default when user price exists
    })

    it('creates only no_charge price when no custom values provided', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Verify price and noChargePrice are the same object
      expect(result.price.id).toBe(result.noChargePrice.id)

      // Verify it's a no_charge price with defaults
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.slug).toBe(
        'default-price-api-calls_no_charge'
      )
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
      expect(result.price.isDefault).toBe(true)
    })

    it('creates custom price when only unitPrice is provided', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
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
              cacheRecomputationContext,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Custom price should exist with user's unitPrice and default usageEventsPerUnit
      expect(result.price.unitPrice).toBe(500)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.slug).toBe('partial-custom-price')
      expect(result.price.productId).toBeNull()
      expect(result.price.isDefault).toBe(true)

      // No-charge price should also exist
      expect(result.noChargePrice.id).not.toBe(result.price.id)
      expect(result.noChargePrice.slug).toBe(
        'partial-custom-price_no_charge'
      )
      expect(result.noChargePrice.isDefault).toBe(false)
    })

    it('creates custom price when only usageEventsPerUnit is provided', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Events Per Unit Only',
                slug: 'events-per-unit-only',
                pricingModelId: pricingModel.id,
              },
              price: {
                usageEventsPerUnit: 50,
              },
            },
            {
              transaction,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
              cacheRecomputationContext,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      // Custom price should exist with default unitPrice and user's usageEventsPerUnit
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.usageEventsPerUnit).toBe(50)
      expect(result.price.slug).toBe('events-per-unit-only')
      expect(result.price.isDefault).toBe(true)

      // No-charge price should also exist
      expect(result.noChargePrice.id).not.toBe(result.price.id)
      expect(result.noChargePrice.slug).toBe(
        'events-per-unit-only_no_charge'
      )
      expect(result.noChargePrice.isDefault).toBe(false)
    })
  })

  describe('No charge price auto-creation', () => {
    it('creates no_charge price with correct name derived from usage meter name', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Storage GB',
                slug: 'storage-gb',
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
              cacheRecomputationContext,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.noChargePrice.name).toBe('Storage GB - No Charge')
    })

    it('creates no_charge price with correct pricingModelId and usageMeterId', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Bandwidth',
                slug: 'bandwidth',
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
              cacheRecomputationContext,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.noChargePrice.pricingModelId).toBe(
        pricingModel.id
      )
      expect(result.noChargePrice.usageMeterId).toBe(
        result.usageMeter.id
      )
    })

    it('creates no_charge price with organization defaultCurrency', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Requests',
                slug: 'requests',
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
              cacheRecomputationContext,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.noChargePrice.currency).toBe(
        organization.defaultCurrency
      )
    })

    it('creates no_charge price as active by default', async () => {
      const result = await comprehensiveAdminTransaction(
        async ({
          transaction,
          invalidateCache,
          cacheRecomputationContext,
        }) => {
          const usageMeterResult = await createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'Compute Hours',
                slug: 'compute-hours',
                pricingModelId: pricingModel.id,
              },
            },
            {
              transaction,
              livemode: false,
              organizationId: organization.id,
              invalidateCache,
              cacheRecomputationContext,
            }
          )
          return Result.ok(usageMeterResult)
        }
      )

      expect(result.noChargePrice.active).toBe(true)
    })
  })
})
