import { describe, expect, it } from 'vitest'
import {
  type Price,
  pricesClientInsertSchema,
} from '@/db/schema/prices'
import { type CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { parseEditPriceDefaultValues } from './EditPriceModal'

describe('parseEditPriceDefaultValues', () => {
  const basePrice: Partial<Price.ClientRecord> = {
    id: 'price_test123',
    name: 'Test Price',
    slug: 'test-price',
    productId: 'product_test123',
    livemode: false,
    currency: 'USD' as CurrencyCode,
    isDefault: true,
    active: true,
    createdAt: Date.parse('2024-01-01'),
    updatedAt: Date.parse('2024-01-01'),
  }

  describe('Valid Inputs - Should NOT Throw', () => {
    describe('Subscription Price Type', () => {
      it('should accept valid subscription price with all required fields', () => {
        const validSubscription: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.Subscription,
          unitPrice: 1999,
          intervalCount: 1,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: 14,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(validSubscription)
        ).not.toThrow()

        const result = parseEditPriceDefaultValues(validSubscription)

        // Verify output passes schema validation
        expect(() =>
          pricesClientInsertSchema.parse(result.price)
        ).not.toThrow()

        // Verify structure
        expect(result).toHaveProperty('price')
        expect(result).toHaveProperty('__rawPriceString')

        // Verify price is Price.ClientInsert type with all required fields
        expect(result.price).toMatchObject({
          type: PriceType.Subscription,
          productId: 'product_test123',
          unitPrice: 1999,
          intervalCount: 1,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: 14,
          usageEventsPerUnit: null,
          usageMeterId: null,
        })
      })

      it('should accept subscription with annual interval', () => {
        const annualSubscription: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.Subscription,
          unitPrice: 19900,
          intervalCount: 1,
          intervalUnit: IntervalUnit.Year,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(annualSubscription)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(annualSubscription)
        expect(() =>
          pricesClientInsertSchema.parse(result.price)
        ).not.toThrow()
        expect(result.price.intervalUnit).toBe(IntervalUnit.Year)
      })

      it('should accept subscription with multi-month interval', () => {
        const quarterlySubscription: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.Subscription,
          unitPrice: 5900,
          intervalCount: 3,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(quarterlySubscription)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(
          quarterlySubscription
        )
        expect(() =>
          pricesClientInsertSchema.parse(result.price)
        ).not.toThrow()
        expect(result.price.intervalCount).toBe(3)
      })

      it('should default intervalCount to 1 when undefined', () => {
        const subscriptionWithoutInterval: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.Subscription,
          unitPrice: 1000,
          intervalCount: undefined as any,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(subscriptionWithoutInterval)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(
          subscriptionWithoutInterval
        )
        expect(result.price.intervalCount).toBe(1)
      })

      it('should default intervalUnit to Month when undefined', () => {
        const subscriptionWithoutUnit: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.Subscription,
          unitPrice: 1000,
          intervalCount: 1,
          intervalUnit: undefined as any,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(subscriptionWithoutUnit)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(
          subscriptionWithoutUnit
        )
        expect(result.price.intervalUnit).toBe(IntervalUnit.Month)
      })
    })

    describe('SinglePayment Price Type', () => {
      it('should accept valid single payment price', () => {
        const validSinglePayment: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.SinglePayment,
          unitPrice: 4999,
          intervalCount: null,
          intervalUnit: null,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(validSinglePayment)
        ).not.toThrow()

        const result = parseEditPriceDefaultValues(validSinglePayment)

        // Verify output passes schema validation
        expect(() =>
          pricesClientInsertSchema.parse(result.price)
        ).not.toThrow()

        // Verify SinglePayment specific fields are null
        expect(result.price.intervalCount).toBe(null)
        expect(result.price.intervalUnit).toBe(null)
        expect(result.price.trialPeriodDays).toBe(null)
      })

      it('should force null intervals even if provided', () => {
        const singlePaymentWithIntervals: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.SinglePayment,
          unitPrice: 2999,
          intervalCount: 1 as any,
          intervalUnit: IntervalUnit.Month as any,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(singlePaymentWithIntervals)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(
          singlePaymentWithIntervals
        )

        // Should override to null
        expect(result.price.intervalCount).toBe(null)
        expect(result.price.intervalUnit).toBe(null)
      })
    })

    describe('Usage Price Type', () => {
      it('should accept valid usage-based price', () => {
        // FIXME: PR 2 - Usage prices should have productId: null
        const validUsage: Price.ClientRecord = {
          ...basePrice,
          productId: null, // Usage prices don't have productId
          type: PriceType.Usage,
          unitPrice: 50,
          intervalCount: 1,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: null,
          usageEventsPerUnit: 100,
          usageMeterId: 'meter_test123',
        } as unknown as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(validUsage)
        ).not.toThrow()

        const result = parseEditPriceDefaultValues(validUsage)

        // Verify output passes schema validation
        expect(() =>
          pricesClientInsertSchema.parse(result.price)
        ).not.toThrow()

        // Verify usage-specific fields
        expect(result.price.usageEventsPerUnit).toBe(100)
        expect(result.price.usageMeterId).toBe('meter_test123')
      })

      it('should accept usage price with different usage events per unit', () => {
        // FIXME: PR 2 - Usage prices should have productId: null
        const usagePrice: Price.ClientRecord = {
          ...basePrice,
          productId: null, // Usage prices don't have productId
          type: PriceType.Usage,
          unitPrice: 1000,
          intervalCount: 1,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: null,
          usageEventsPerUnit: 1000,
          usageMeterId: 'meter_api_calls',
        } as unknown as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(usagePrice)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(usagePrice)
        expect(() =>
          pricesClientInsertSchema.parse(result.price)
        ).not.toThrow()
        expect(result.price.usageEventsPerUnit).toBe(1000)
      })
    })

    describe('Edge Cases', () => {
      it('should accept zero unit price', () => {
        const freePrice: Price.ClientRecord = {
          ...basePrice,
          type: PriceType.Subscription,
          unitPrice: 0,
          intervalCount: 1,
          intervalUnit: IntervalUnit.Month,
          trialPeriodDays: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
        } as Price.ClientRecord

        expect(() =>
          parseEditPriceDefaultValues(freePrice)
        ).not.toThrow()
        const result = parseEditPriceDefaultValues(freePrice)
        expect(result.price.unitPrice).toBe(0)
        expect(result.__rawPriceString).toBe('0.00')
      })
    })
  })

  describe('Invalid Inputs - Should Throw', () => {
    it('should throw when missing required productId', () => {
      const missingProductId = {
        ...basePrice,
        productId: undefined as any,
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      expect(() =>
        parseEditPriceDefaultValues(missingProductId)
      ).toThrow()
    })

    it('should throw when missing required type', () => {
      const missingType = {
        ...basePrice,
        type: undefined as any,
        unitPrice: 1000,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      expect(() => parseEditPriceDefaultValues(missingType)).toThrow()
    })

    it('should throw when negative unitPrice', () => {
      const negativePrice = {
        ...basePrice,
        type: PriceType.Subscription,
        unitPrice: -1000,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      expect(() =>
        parseEditPriceDefaultValues(negativePrice)
      ).toThrow()
    })

    it('should throw for Usage type without usageMeterId', () => {
      // FIXME: PR 2 - Usage prices should have productId: null
      const usageWithoutMeter = {
        ...basePrice,
        productId: null,
        type: PriceType.Usage,
        unitPrice: 100,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: 100,
        usageMeterId: null as any,
      } as unknown as Price.ClientRecord

      expect(() =>
        parseEditPriceDefaultValues(usageWithoutMeter)
      ).toThrow()
    })

    it('should throw for Usage type without usageEventsPerUnit', () => {
      // FIXME: PR 2 - Usage prices should have productId: null
      const usageWithoutEvents = {
        ...basePrice,
        productId: null,
        type: PriceType.Usage,
        unitPrice: 100,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null as any,
        usageMeterId: 'meter_test123',
      } as unknown as Price.ClientRecord

      expect(() =>
        parseEditPriceDefaultValues(usageWithoutEvents)
      ).toThrow()
    })

    it('should throw for negative trialPeriodDays', () => {
      const negativeTrialPeriod = {
        ...basePrice,
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: -7,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      expect(() =>
        parseEditPriceDefaultValues(negativeTrialPeriod)
      ).toThrow()
    })

    it('should throw for negative intervalCount', () => {
      const negativeInterval = {
        ...basePrice,
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalCount: -1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      expect(() =>
        parseEditPriceDefaultValues(negativeInterval)
      ).toThrow()
    })
  })

  describe('Output Validation', () => {
    it('should return object with price and __rawPriceString properties', () => {
      const validPrice: Price.ClientRecord = {
        ...basePrice,
        type: PriceType.Subscription,
        unitPrice: 1999,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      const result = parseEditPriceDefaultValues(validPrice)

      expect(result).toHaveProperty('price')
      expect(result).toHaveProperty('__rawPriceString')
      expect(typeof result.__rawPriceString).toBe('string')
    })

    it('should return price that is valid Price.ClientInsert type', () => {
      const validPrice: Price.ClientRecord = {
        ...basePrice,
        type: PriceType.Subscription,
        unitPrice: 1999,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      const result = parseEditPriceDefaultValues(validPrice)

      // Should pass schema validation
      expect(() =>
        pricesClientInsertSchema.parse(result.price)
      ).not.toThrow()

      // Should have all required fields for Price.ClientInsert
      expect(result.price).toHaveProperty('productId')
      expect(result.price).toHaveProperty('type')
      expect(result.price).toHaveProperty('unitPrice')
    })

    it('should format __rawPriceString correctly for USD', () => {
      const price: Price.ClientRecord = {
        ...basePrice,
        currency: 'USD' as CurrencyCode,
        type: PriceType.Subscription,
        unitPrice: 1999,
        intervalCount: 1,
        intervalUnit: IntervalUnit.Month,
        trialPeriodDays: null,
        usageEventsPerUnit: null,
        usageMeterId: null,
      } as Price.ClientRecord

      const result = parseEditPriceDefaultValues(price)

      expect(result.__rawPriceString).toBe('19.99')
    })
  })
})
