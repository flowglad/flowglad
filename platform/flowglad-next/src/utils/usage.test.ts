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
import { getNoChargeSlugForMeter } from './usage/noChargePriceHelpers'

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
    it('creates usage meter with only no_charge price when no custom price values provided', async () => {
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

      // When no custom price values are provided, price and noChargePrice are the same
      expect(result.price.id).toBe(result.noChargePrice.id)

      // Verify no_charge price properties
      expect(result.noChargePrice.name).toBe('API Calls - No Charge')
      expect(result.noChargePrice.slug).toBe(
        getNoChargeSlugForMeter('api-calls')
      )
      expect(result.noChargePrice.type).toBe(PriceType.Usage)
      expect(result.noChargePrice.unitPrice).toBe(0)
      expect(result.noChargePrice.usageMeterId).toBe(
        result.usageMeter.id
      )
      expect(result.noChargePrice.productId).toBeNull()
      expect(result.noChargePrice.pricingModelId).toBe(
        pricingModel.id
      )
      expect(result.noChargePrice.intervalUnit).toBe(
        IntervalUnit.Month
      )
      expect(result.noChargePrice.intervalCount).toBe(1)
      expect(result.noChargePrice.usageEventsPerUnit).toBe(1)
      // No_charge price is default when no user-specified price exists
      expect(result.noChargePrice.isDefault).toBe(true)
      expect(result.noChargePrice.active).toBe(true)
      expect(result.noChargePrice.currency).toBe(
        organization.defaultCurrency
      )
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

      // Create usage meter with the same slug and custom price values
      // to create a user price that shares the slug with the product price
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
            {
              usageMeter: {
                name: 'New Usage Meter',
                slug,
                pricingModelId: pricingModel.id,
              },
              price: {
                unitPrice: 100,
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

      // Verify usage meter and user price were created
      expect(result.usageMeter.slug).toBe(slug)
      expect(result.price.slug).toBe(slug)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()

      // Verify no_charge price was also created
      expect(result.noChargePrice.slug).toBe(
        getNoChargeSlugForMeter(slug)
      )

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
      expect(subscriptionPrice?.type).toBe(PriceType.Subscription)
      expect(usagePrice?.type).toBe(PriceType.Usage)
    })

    it('creates no_charge price when usage meter has unique slug', async () => {
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

      // Create usage meter without custom price values
      // Only no_charge price will be created
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

      // Verify usage meter was created
      expect(result.usageMeter.slug).toBe(slug)

      // When no custom price values, price and noChargePrice are the same
      expect(result.price.id).toBe(result.noChargePrice.id)
      expect(result.price.slug).toBe(getNoChargeSlugForMeter(slug))
      expect(result.price.productId).toBeNull()
      expect(result.price.active).toBe(true)
      expect(result.price.isDefault).toBe(true)
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
    it('creates both user price and no_charge price when custom values provided', async () => {
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

      // Verify user's price has custom values and is default
      expect(result.price.name).toBe('Custom Price API Calls')
      expect(result.price.slug).toBe('custom-price-api-calls')
      expect(result.price.unitPrice).toBe(1000)
      expect(result.price.usageEventsPerUnit).toBe(100)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
      expect(result.price.isDefault).toBe(true)
      expect(result.price.usageMeterId).toBe(result.usageMeter.id)

      // Verify no_charge price was also created (separate from user's price)
      expect(result.noChargePrice.id).not.toBe(result.price.id)
      expect(result.noChargePrice.name).toBe(
        'Custom Price API Calls - No Charge'
      )
      expect(result.noChargePrice.slug).toBe(
        getNoChargeSlugForMeter('custom-price-api-calls')
      )
      expect(result.noChargePrice.unitPrice).toBe(0)
      expect(result.noChargePrice.usageEventsPerUnit).toBe(1)
      expect(result.noChargePrice.isDefault).toBe(false)
      expect(result.noChargePrice.usageMeterId).toBe(
        result.usageMeter.id
      )
    })

    it('creates only no_charge price when no custom values provided', async () => {
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

      // When no custom values, price and noChargePrice are the same
      expect(result.price.id).toBe(result.noChargePrice.id)

      // Verify the no_charge price properties
      expect(result.price.name).toBe(
        'Default Price API Calls - No Charge'
      )
      expect(result.price.slug).toBe(
        getNoChargeSlugForMeter('default-price-api-calls')
      )
      expect(result.price.unitPrice).toBe(0)
      expect(result.price.usageEventsPerUnit).toBe(1)
      expect(result.price.type).toBe(PriceType.Usage)
      expect(result.price.productId).toBeNull()
      expect(result.price.isDefault).toBe(true)
    })

    it('creates user price when only unitPrice is provided', async () => {
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

      // Verify user's price is created with custom unitPrice
      expect(result.price.slug).toBe('partial-custom-price')
      expect(result.price.unitPrice).toBe(500)
      expect(result.price.usageEventsPerUnit).toBe(1) // Default
      expect(result.price.productId).toBeNull()
      expect(result.price.isDefault).toBe(true)

      // Verify no_charge price also created
      expect(result.noChargePrice.id).not.toBe(result.price.id)
      expect(result.noChargePrice.slug).toBe(
        getNoChargeSlugForMeter('partial-custom-price')
      )
      expect(result.noChargePrice.isDefault).toBe(false)
    })

    it('creates user price when only usageEventsPerUnit is provided', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageMeterTransaction(
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
              userId,
              livemode: false,
              organizationId: organization.id,
            }
          )
        }
      )

      // Verify user's price is created with custom usageEventsPerUnit
      expect(result.price.slug).toBe('events-per-unit-only')
      expect(result.price.unitPrice).toBe(0) // Default
      expect(result.price.usageEventsPerUnit).toBe(50)
      expect(result.price.isDefault).toBe(true)

      // Verify no_charge price also created
      expect(result.noChargePrice.id).not.toBe(result.price.id)
      expect(result.noChargePrice.isDefault).toBe(false)
    })
  })
})
