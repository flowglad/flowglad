import { describe, expect, it } from 'bun:test'
import {
  type CurrencyCode,
  IntervalUnit,
  PriceType,
} from '@db-core/enums'
import {
  type Price,
  pricesClientInsertSchema,
} from '@db-core/schema/prices'

/**
 * Tests for EditUsagePriceModal schema validation.
 *
 * Usage prices have productId === null because they belong to usage meters,
 * not products. When immutable fields (unitPrice, usageEventsPerUnit) change,
 * a new price is created - these tests verify the created price data is valid.
 */
describe('EditUsagePriceModal schema validation', () => {
  // Base usage price record with productId: null
  const baseUsagePrice: Price.ClientUsageRecord = {
    id: 'price_test123',
    name: 'API Calls',
    slug: 'api-calls',
    livemode: false,
    currency: 'USD' as CurrencyCode,
    isDefault: true,
    active: true,
    createdAt: Date.parse('2024-01-01'),
    updatedAt: Date.parse('2024-01-01'),
    type: PriceType.Usage,
    productId: null, // Post-migration: usage prices have null productId
    pricingModelId: 'pm_test123',
    usageMeterId: 'meter_test123',
    usageEventsPerUnit: 100,
    unitPrice: 50,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: null,
  }

  describe('Usage price with productId === null from existing record', () => {
    it('creates valid price insert data when immutable fields change', () => {
      // Simulate what EditUsagePriceModal does when creating a new price
      // due to immutable field changes (unitPrice or usageEventsPerUnit)
      const newPriceData = {
        type: PriceType.Usage,
        productId: baseUsagePrice.productId, // null from existing record
        unitPrice: 100, // Changed from 50
        usageEventsPerUnit: 200, // Changed from 100
        usageMeterId: baseUsagePrice.usageMeterId,
        isDefault: baseUsagePrice.isDefault,
        name: 'Updated API Calls',
        slug: 'updated-api-calls',
        intervalUnit: baseUsagePrice.intervalUnit,
        intervalCount: baseUsagePrice.intervalCount,
        trialPeriodDays: null,
      }

      const result = pricesClientInsertSchema.safeParse(newPriceData)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(PriceType.Usage)
        expect(result.data.productId).toBe(null)
        expect(result.data.usageMeterId).toBe('meter_test123')
        expect(result.data.unitPrice).toBe(100)
        expect(result.data.usageEventsPerUnit).toBe(200)
      }
    })

    it('preserves null productId when passing through price record', () => {
      // Verify that the base usage price with null productId
      // can be used to construct valid insert data
      expect(baseUsagePrice.productId).toBe(null)

      const insertData = {
        type: baseUsagePrice.type,
        productId: baseUsagePrice.productId,
        unitPrice: baseUsagePrice.unitPrice,
        usageEventsPerUnit: baseUsagePrice.usageEventsPerUnit,
        usageMeterId: baseUsagePrice.usageMeterId,
        isDefault: baseUsagePrice.isDefault,
        name: baseUsagePrice.name,
        slug: baseUsagePrice.slug,
        intervalUnit: baseUsagePrice.intervalUnit,
        intervalCount: baseUsagePrice.intervalCount,
        trialPeriodDays: baseUsagePrice.trialPeriodDays,
      }

      const result = pricesClientInsertSchema.safeParse(insertData)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.productId).toBe(null)
      }
    })
  })

  describe('Valid usage price records with null productId', () => {
    it('accepts usage price record with all required fields and null productId', () => {
      const validUsagePrice = {
        type: PriceType.Usage,
        productId: null,
        unitPrice: 50,
        usageEventsPerUnit: 100,
        usageMeterId: 'meter_test123',
        isDefault: true,
        name: 'API Calls',
        slug: 'api-calls',
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
      }

      const result =
        pricesClientInsertSchema.safeParse(validUsagePrice)

      expect(result.success).toBe(true)
    })

    it('accepts usage price with different interval units', () => {
      const weeklyUsagePrice = {
        type: PriceType.Usage,
        productId: null,
        unitPrice: 10,
        usageEventsPerUnit: 50,
        usageMeterId: 'meter_weekly',
        isDefault: false,
        name: 'Weekly API Calls',
        slug: 'weekly-api-calls',
        intervalUnit: IntervalUnit.Week,
        intervalCount: 1,
        trialPeriodDays: null,
      }

      const result =
        pricesClientInsertSchema.safeParse(weeklyUsagePrice)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.intervalUnit).toBe(IntervalUnit.Week)
      }
    })

    it('accepts usage price with zero unit price (free tier)', () => {
      const freeUsagePrice = {
        type: PriceType.Usage,
        productId: null,
        unitPrice: 0,
        usageEventsPerUnit: 1000,
        usageMeterId: 'meter_free_tier',
        isDefault: true,
        name: 'Free Tier',
        slug: 'free-tier',
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
      }

      const result =
        pricesClientInsertSchema.safeParse(freeUsagePrice)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.unitPrice).toBe(0)
      }
    })
  })
})
