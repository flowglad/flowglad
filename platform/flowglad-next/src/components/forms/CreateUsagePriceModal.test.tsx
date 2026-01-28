import { describe, expect, it } from 'bun:test'
import {
  createPriceFormSchema,
  pricesClientInsertSchema,
} from '@/db/schema/prices'
import { IntervalUnit, PriceType } from '@/types'

/**
 * Tests for CreateUsagePriceModal form schema validation.
 *
 * Usage prices belong to usage meters (not products), so they have
 * productId: null. These tests verify the schema accepts this structure.
 */
describe('CreateUsagePriceModal schema validation', () => {
  describe('Usage price with productId: null', () => {
    it('accepts usage price insert with productId explicitly set to null', () => {
      const usagePriceInput = {
        type: PriceType.Usage,
        name: 'API Calls',
        slug: 'api-calls',
        isDefault: true,
        usageMeterId: 'meter_test123',
        usageEventsPerUnit: 100,
        unitPrice: 50,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        productId: null, // Usage prices belong to meters, not products
      }

      // Should pass the client insert schema validation
      const result =
        pricesClientInsertSchema.safeParse(usagePriceInput)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(PriceType.Usage)
        expect(result.data.productId).toBe(null)
        expect(result.data.usageMeterId).toBe('meter_test123')
      }
    })

    it('accepts usage price insert with productId omitted (undefined)', () => {
      const usagePriceInput = {
        type: PriceType.Usage,
        name: 'API Calls',
        slug: 'api-calls',
        isDefault: true,
        usageMeterId: 'meter_test123',
        usageEventsPerUnit: 100,
        unitPrice: 50,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        // productId intentionally omitted - should be treated as null
      }

      // Should pass the client insert schema validation
      const result =
        pricesClientInsertSchema.safeParse(usagePriceInput)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(PriceType.Usage)
        // productId should be null (transformed from undefined)
        expect(result.data.productId).toBe(null)
      }
    })

    it('accepts the full createPriceFormSchema with usage price data', () => {
      const formInput = {
        price: {
          type: PriceType.Usage,
          name: 'API Calls',
          slug: 'api-calls',
          isDefault: true,
          usageMeterId: 'meter_test123',
          usageEventsPerUnit: 100,
          unitPrice: 50,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          trialPeriodDays: null,
          productId: null,
        },
        __rawPriceString: '0.50',
      }

      const result = createPriceFormSchema.safeParse(formInput)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.price.type).toBe(PriceType.Usage)
        expect(result.data.price.productId).toBe(null)
        expect(result.data.__rawPriceString).toBe('0.50')
      }
    })
  })

  describe('Usage price requires usageMeterId', () => {
    it('rejects usage price without usageMeterId', () => {
      const invalidInput = {
        type: PriceType.Usage,
        name: 'API Calls',
        slug: 'api-calls',
        isDefault: true,
        usageMeterId: null, // Invalid: usage prices must have a meter
        usageEventsPerUnit: 100,
        unitPrice: 50,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        productId: null,
      }

      const result = pricesClientInsertSchema.safeParse(invalidInput)

      expect(result.success).toBe(false)
    })
  })

  describe('Usage price requires usageEventsPerUnit', () => {
    it('rejects usage price without usageEventsPerUnit', () => {
      const invalidInput = {
        type: PriceType.Usage,
        name: 'API Calls',
        slug: 'api-calls',
        isDefault: true,
        usageMeterId: 'meter_test123',
        usageEventsPerUnit: null, // Invalid: must be a positive integer
        unitPrice: 50,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        productId: null,
      }

      const result = pricesClientInsertSchema.safeParse(invalidInput)

      expect(result.success).toBe(false)
    })

    it('rejects usage price with zero usageEventsPerUnit', () => {
      const invalidInput = {
        type: PriceType.Usage,
        name: 'API Calls',
        slug: 'api-calls',
        isDefault: true,
        usageMeterId: 'meter_test123',
        usageEventsPerUnit: 0, // Invalid: must be positive
        unitPrice: 50,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        productId: null,
      }

      const result = pricesClientInsertSchema.safeParse(invalidInput)

      expect(result.success).toBe(false)
    })
  })

  describe('Subscription/SinglePayment prices still require productId', () => {
    it('rejects subscription price with null productId', () => {
      const invalidInput = {
        type: PriceType.Subscription,
        name: 'Pro Plan',
        slug: 'pro-plan',
        isDefault: true,
        usageMeterId: null,
        usageEventsPerUnit: null,
        unitPrice: 1999,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        productId: null, // Invalid: subscription prices require productId
      }

      const result = pricesClientInsertSchema.safeParse(invalidInput)

      expect(result.success).toBe(false)
    })

    it('rejects single payment price with null productId', () => {
      const invalidInput = {
        type: PriceType.SinglePayment,
        name: 'One-time Purchase',
        slug: 'one-time-purchase',
        isDefault: true,
        usageMeterId: null,
        usageEventsPerUnit: null,
        unitPrice: 4999,
        intervalUnit: null,
        intervalCount: null,
        trialPeriodDays: null,
        productId: null, // Invalid: single payment prices require productId
      }

      const result = pricesClientInsertSchema.safeParse(invalidInput)

      expect(result.success).toBe(false)
    })

    it('accepts subscription price with valid productId', () => {
      const validInput = {
        type: PriceType.Subscription,
        name: 'Pro Plan',
        slug: 'pro-plan',
        isDefault: true,
        usageMeterId: null,
        usageEventsPerUnit: null,
        unitPrice: 1999,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: null,
        productId: 'product_test123', // Valid: subscription prices have productId
      }

      const result = pricesClientInsertSchema.safeParse(validInput)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.productId).toBe('product_test123')
      }
    })
  })
})
