import { describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { TRPCError } from '@trpc/server'
import {
  validatePriceTypeProductIdConsistency,
  validateProductPriceConstraints,
} from './priceValidation'

// Helper function to create a subscription price insert
const createSubscriptionPriceInsert = (
  overrides?: Partial<Price.ClientSubscriptionInsert>
): Price.ClientSubscriptionInsert => {
  return {
    productId: 'product-1',
    type: PriceType.Subscription,
    unitPrice: 1000,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: 0,
    usageMeterId: null,
    usageEventsPerUnit: null,
    name: 'Test Subscription Price',
    slug: 'test-subscription-price',
    isDefault: false,
    active: true,
    ...overrides,
  }
}

// Helper function to create a single payment price insert
const createSinglePaymentPriceInsert = (
  overrides?: Partial<Price.ClientSinglePaymentInsert>
): Price.ClientSinglePaymentInsert => {
  return {
    productId: 'product-1',
    type: PriceType.SinglePayment,
    unitPrice: 5000,
    intervalUnit: null,
    intervalCount: null,
    trialPeriodDays: null,
    usageMeterId: null,
    usageEventsPerUnit: null,
    name: 'Test Single Payment Price',
    slug: 'test-single-payment-price',
    isDefault: false,
    active: true,
    ...overrides,
  }
}

// Helper function to create a usage price insert
const createUsagePriceInsert = (
  overrides?: Partial<Price.ClientUsageInsert>
): Price.ClientUsageInsert => {
  return {
    productId: null,
    type: PriceType.Usage,
    unitPrice: 100,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: null,
    usageMeterId: 'meter-1',
    usageEventsPerUnit: 1,
    name: 'Test Usage Price',
    slug: 'test-usage-price',
    isDefault: true,
    active: true,
    ...overrides,
  }
}

describe('priceValidation', () => {
  describe('validatePriceTypeProductIdConsistency', () => {
    it('throws BAD_REQUEST when usage price has a non-null productId string', () => {
      // Create a usage price with an invalid productId (should be null for usage prices)
      const price = {
        ...createUsagePriceInsert(),
        productId: 'prod_123',
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).toThrow(TRPCError)

      try {
        validatePriceTypeProductIdConsistency(price)
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Usage prices cannot have a productId. They belong to usage meters.'
        )
      }
    })

    it('does not throw when usage price has null productId', () => {
      const price = createUsagePriceInsert({ productId: null })

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).not.toThrow()
    })

    it('does not throw when usage price has undefined productId', () => {
      const price = {
        ...createUsagePriceInsert(),
        productId: undefined,
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).not.toThrow()
    })

    it('throws BAD_REQUEST when subscription price has null productId', () => {
      const price = {
        ...createSubscriptionPriceInsert(),
        productId: null,
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).toThrow(TRPCError)

      try {
        validatePriceTypeProductIdConsistency(price)
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Subscription and single payment prices require a productId.'
        )
      }
    })

    it('throws BAD_REQUEST when subscription price has undefined productId', () => {
      const price = {
        ...createSubscriptionPriceInsert(),
        productId: undefined,
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).toThrow(TRPCError)

      try {
        validatePriceTypeProductIdConsistency(price)
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Subscription and single payment prices require a productId.'
        )
      }
    })

    it('throws BAD_REQUEST when subscription price has empty string productId', () => {
      const price = {
        ...createSubscriptionPriceInsert(),
        productId: '',
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).toThrow(TRPCError)

      try {
        validatePriceTypeProductIdConsistency(price)
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Subscription and single payment prices require a productId.'
        )
      }
    })

    it('throws BAD_REQUEST when subscription price has whitespace-only productId', () => {
      const price = {
        ...createSubscriptionPriceInsert(),
        productId: '   ',
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).toThrow(TRPCError)

      try {
        validatePriceTypeProductIdConsistency(price)
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Subscription and single payment prices require a productId.'
        )
      }
    })

    it('does not throw when subscription price has valid productId', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
      })

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).not.toThrow()
    })

    it('throws BAD_REQUEST when single payment price has null productId', () => {
      const price = {
        ...createSinglePaymentPriceInsert(),
        productId: null,
      } as unknown as Price.ClientInsert

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).toThrow(TRPCError)

      try {
        validatePriceTypeProductIdConsistency(price)
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Subscription and single payment prices require a productId.'
        )
      }
    })

    it('does not throw when single payment price has valid productId', () => {
      const price = createSinglePaymentPriceInsert({
        productId: 'prod_456',
      })

      expect(() =>
        validatePriceTypeProductIdConsistency(price)
      ).not.toThrow()
    })
  })

  describe('validateProductPriceConstraints', () => {
    it('throws FORBIDDEN when creating additional price for default product that already has prices', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: true },
          existingPrices: [{ type: PriceType.Subscription }],
        })
      ).toThrow(TRPCError)

      try {
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: true },
          existingPrices: [{ type: PriceType.Subscription }],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('FORBIDDEN')
        expect(trpcError.message).toBe(
          'Cannot create additional prices for the default plan'
        )
      }
    })

    it('does not throw when creating first price for default product', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
        unitPrice: 0,
        isDefault: true,
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: true },
          existingPrices: [],
        })
      ).not.toThrow()
    })

    it('throws BAD_REQUEST when default price on default product has non-zero unitPrice', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
        unitPrice: 1000,
        isDefault: true,
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: true },
          existingPrices: [],
        })
      ).toThrow(TRPCError)

      try {
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: true },
          existingPrices: [],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('BAD_REQUEST')
        expect(trpcError.message).toBe(
          'Default prices on default products must have unitPrice = 0'
        )
      }
    })

    it('does not throw when default price on default product has unitPrice = 0', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
        unitPrice: 0,
        isDefault: true,
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: true },
          existingPrices: [],
        })
      ).not.toThrow()
    })

    it('throws FORBIDDEN when creating price of different type than existing prices', () => {
      const price = createSinglePaymentPriceInsert({
        productId: 'prod_123',
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: false },
          existingPrices: [{ type: PriceType.Subscription }],
        })
      ).toThrow(TRPCError)

      try {
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: false },
          existingPrices: [{ type: PriceType.Subscription }],
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        const trpcError = error as TRPCError
        expect(trpcError.code).toBe('FORBIDDEN')
        expect(trpcError.message).toBe(
          'Cannot create price of a different type than the existing prices for the product'
        )
      }
    })

    it('does not throw when creating price of same type as existing prices', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
        unitPrice: 2000,
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: false },
          existingPrices: [{ type: PriceType.Subscription }],
        })
      ).not.toThrow()
    })

    it('does not throw when creating first price for non-default product', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: false },
          existingPrices: [],
        })
      ).not.toThrow()
    })

    it('does not throw when creating multiple prices with same type for non-default product', () => {
      const price = createSubscriptionPriceInsert({
        productId: 'prod_123',
        unitPrice: 3000,
        name: 'Premium Plan',
        slug: 'premium-plan',
      })

      expect(() =>
        validateProductPriceConstraints({
          price: price as Price.ClientInsert & { productId: string },
          product: { default: false },
          existingPrices: [
            { type: PriceType.Subscription },
            { type: PriceType.Subscription },
          ],
        })
      ).not.toThrow()
    })
  })
})
