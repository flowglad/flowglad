import { describe, expect, it } from 'bun:test'
import type { Price } from '@/db/schema/prices'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { isPriceChanged } from './pricingModel'

// Helper function to create a base subscription price ClientInsert
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
    name: 'Test Price',
    slug: 'test-price',
    isDefault: true,
    active: true,
    ...overrides,
  }
}

// Helper function to create a base subscription price ClientRecord
const createSubscriptionPriceRecord = (
  overrides?: Partial<Price.ClientSubscriptionRecord>
): Price.ClientSubscriptionRecord => {
  return {
    id: 'price-1',
    productId: 'product-1',
    type: PriceType.Subscription,
    unitPrice: 1000,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: 0,
    usageMeterId: null,
    usageEventsPerUnit: null,
    name: 'Test Price',
    slug: 'test-price',
    isDefault: true,
    active: true,
    currency: CurrencyCode.USD,
    livemode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pricingModelId: 'test',
    ...overrides,
  }
}

// Helper function to create a single payment price ClientInsert
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
    name: 'Single Payment Price',
    slug: 'single-payment-price',
    isDefault: true,
    active: true,
    ...overrides,
  }
}

// Helper function to create a single payment price ClientRecord
const createSinglePaymentPriceRecord = (
  overrides?: Partial<Price.ClientSinglePaymentRecord>
): Price.ClientSinglePaymentRecord => {
  return {
    id: 'price-1',
    productId: 'product-1',
    pricingModelId: 'test',
    type: PriceType.SinglePayment,
    unitPrice: 5000,
    intervalUnit: null as null,
    intervalCount: null as null,
    trialPeriodDays: null,
    usageMeterId: null,
    usageEventsPerUnit: null,
    name: 'Single Payment Price',
    slug: 'single-payment-price',
    isDefault: true,
    active: true,
    currency: CurrencyCode.USD,
    livemode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// Helper function to create a usage price ClientInsert
const createUsagePriceInsert = (
  overrides?: Partial<Price.ClientUsageInsert>
): Price.ClientUsageInsert => {
  return {
    // Usage prices don't have productId
    productId: null,
    type: PriceType.Usage,
    unitPrice: 100,
    usageMeterId: 'meter-1',
    usageEventsPerUnit: 1,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: null,
    name: 'Usage Price',
    slug: 'usage-price',
    isDefault: true,
    active: true,
    ...overrides,
  }
}

// Helper function to create a usage price ClientRecord
const createUsagePriceRecord = (
  overrides?: Partial<Price.ClientUsageRecord>
): Price.ClientUsageRecord => {
  return {
    id: 'price-1',
    // Usage prices don't have productId
    productId: null,
    pricingModelId: 'test',
    type: PriceType.Usage,
    unitPrice: 100,
    usageMeterId: 'meter-1',
    usageEventsPerUnit: 1,
    intervalUnit: IntervalUnit.Month,
    intervalCount: 1,
    trialPeriodDays: null,
    name: 'Usage Price',
    slug: 'usage-price',
    isDefault: true,
    active: true,
    currency: CurrencyCode.USD,
    livemode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('isPriceChanged', () => {
  describe('No Current Price', () => {
    it('should return true when currentPrice is undefined', () => {
      const newPrice = createSubscriptionPriceInsert()
      const result = isPriceChanged(newPrice, undefined)
      expect(result).toBe(true)
    })

    it('should return true when currentPrice is undefined for single payment price', () => {
      const newPrice = createSinglePaymentPriceInsert()
      const result = isPriceChanged(newPrice, undefined)
      expect(result).toBe(true)
    })

    it('should return true when currentPrice is undefined for usage price', () => {
      const newPrice = createUsagePriceInsert()
      const result = isPriceChanged(newPrice, undefined)
      expect(result).toBe(true)
    })
  })

  describe('Identical Prices (No Change)', () => {
    it('should return false when prices are identical for subscription price', () => {
      const currentPrice = createSubscriptionPriceRecord()
      const newPrice = createSubscriptionPriceInsert({
        productId: currentPrice.productId,
        type: currentPrice.type,
        unitPrice: currentPrice.unitPrice,
        intervalUnit: currentPrice.intervalUnit,
        intervalCount: currentPrice.intervalCount,
        trialPeriodDays: currentPrice.trialPeriodDays,
        usageMeterId: currentPrice.usageMeterId,
        usageEventsPerUnit: currentPrice.usageEventsPerUnit,
        name: currentPrice.name,
        slug: currentPrice.slug,
        isDefault: currentPrice.isDefault,
        active: currentPrice.active,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when prices are identical for single payment price', () => {
      const currentPrice = createSinglePaymentPriceRecord()
      const newPrice = createSinglePaymentPriceInsert({
        productId: currentPrice.productId,
        type: currentPrice.type,
        unitPrice: currentPrice.unitPrice,
        intervalUnit: currentPrice.intervalUnit,
        intervalCount: currentPrice.intervalCount,
        trialPeriodDays: currentPrice.trialPeriodDays,
        usageMeterId: currentPrice.usageMeterId,
        usageEventsPerUnit: currentPrice.usageEventsPerUnit,
        name: currentPrice.name,
        slug: currentPrice.slug,
        isDefault: currentPrice.isDefault,
        active: currentPrice.active,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when prices are identical for usage price', () => {
      const currentPrice = createUsagePriceRecord()
      const newPrice = createUsagePriceInsert({
        productId: currentPrice.productId,
        type: currentPrice.type,
        unitPrice: currentPrice.unitPrice,
        intervalUnit: currentPrice.intervalUnit,
        intervalCount: currentPrice.intervalCount,
        trialPeriodDays: currentPrice.trialPeriodDays,
        usageMeterId: currentPrice.usageMeterId,
        usageEventsPerUnit: currentPrice.usageEventsPerUnit,
        name: currentPrice.name,
        slug: currentPrice.slug,
        isDefault: currentPrice.isDefault,
        active: currentPrice.active,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })
  })

  describe('Immutable Field Changes', () => {
    it('should return true when productId changes', () => {
      const currentPrice = createSubscriptionPriceRecord()
      const newPrice = createSubscriptionPriceInsert({
        productId: 'product-2', // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when intervalCount changes for subscription price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        intervalCount: 1,
      })
      const newPrice = createSubscriptionPriceInsert({
        intervalCount: 3, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when usageMeterId changes to different value', () => {
      const currentPrice = createUsagePriceRecord({
        usageMeterId: 'meter-1',
      })
      const newPrice = createUsagePriceInsert({
        usageMeterId: 'meter-2', // Changed to different value
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when usageEventsPerUnit changes', () => {
      const currentPrice = createUsagePriceRecord({
        usageEventsPerUnit: 1,
      })
      const newPrice = createUsagePriceInsert({
        usageEventsPerUnit: 2, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when intervalUnit changes', () => {
      const currentPrice = createSubscriptionPriceRecord({
        intervalUnit: IntervalUnit.Month,
      })
      const newPrice = createSubscriptionPriceInsert({
        intervalUnit: IntervalUnit.Year, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when intervalCount changes', () => {
      const currentPrice = createSubscriptionPriceRecord({
        intervalCount: 1,
      })
      const newPrice = createSubscriptionPriceInsert({
        intervalCount: 3, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when trialPeriodDays changes from null to value', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: 7, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when trialPeriodDays changes from value to null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: 7,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: null, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when trialPeriodDays changes to different value', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: 7,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: 14, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when unitPrice changes', () => {
      const currentPrice = createSubscriptionPriceRecord({
        unitPrice: 1000,
      })
      const newPrice = createSubscriptionPriceInsert({
        unitPrice: 2000, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Additional Field Changes', () => {
    it('should return true when isDefault changes from true to false', () => {
      const currentPrice = createSubscriptionPriceRecord({
        isDefault: true,
      })
      const newPrice = createSubscriptionPriceInsert({
        isDefault: false, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when isDefault changes from false to true', () => {
      const currentPrice = createSubscriptionPriceRecord({
        isDefault: false,
      })
      const newPrice = createSubscriptionPriceInsert({
        isDefault: true, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when name changes', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: 'Old Name',
      })
      const newPrice = createSubscriptionPriceInsert({
        name: 'New Name', // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when active changes from true to false', () => {
      const currentPrice = createSubscriptionPriceRecord({
        active: true,
      })
      const newPrice = createSubscriptionPriceInsert({
        active: false, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when active changes from false to true', () => {
      const currentPrice = createSubscriptionPriceRecord({
        active: false,
      })
      const newPrice = createSubscriptionPriceInsert({
        active: true, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when slug changes', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'old-slug',
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: 'new-slug', // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Partial Update Normalization - Undefined Fields', () => {
    it('should return false when slug is undefined and matches current price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'test-price',
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined, // Not provided, should normalize from current
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when name is undefined and matches current price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: 'Test Price',
      })
      const newPrice = createSubscriptionPriceInsert({
        name: undefined, // Not provided, should normalize from current
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when isDefault is undefined and matches current price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        isDefault: true,
      })
      const newPrice = createSubscriptionPriceInsert({
        isDefault: undefined, // Not provided, should normalize from current
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when active is undefined and matches current price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        active: true,
      })
      const newPrice = createSubscriptionPriceInsert({
        active: undefined, // Not provided, should normalize from current
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when trialPeriodDays is undefined and matches current price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: 0,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: undefined, // Not provided, should normalize from current
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when multiple fields are undefined and match current price', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'test-price',
        name: 'Test Price',
        isDefault: true,
        active: true,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined,
        name: undefined,
        isDefault: undefined,
        active: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })
  })

  describe('Partial Update with Actual Changes', () => {
    it('should return true when slug is undefined but name is changed', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'test-price',
        name: 'Old Name',
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined, // Normalized
        name: 'New Name', // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when name is undefined but isDefault is changed', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: 'Test Price',
        isDefault: true,
      })
      const newPrice = createSubscriptionPriceInsert({
        name: undefined, // Normalized
        isDefault: false, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when multiple fields undefined but immutable field changed', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'test-price',
        name: 'Test Price',
        unitPrice: 1000,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined,
        name: undefined,
        unitPrice: 2000, // Immutable field changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Null vs Undefined Handling', () => {
    it('should return false when newPrice.slug is undefined and currentPrice.slug is null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when newPrice.name is undefined and currentPrice.name is null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        name: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return true when newPrice.trialPeriodDays is null and currentPrice.trialPeriodDays is undefined', () => {
      // Note: The function only normalizes undefined, not null. So null is treated as an actual value change from undefined.
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: undefined,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: null, // null is not normalized, so this is treated as a change
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return false when newPrice.trialPeriodDays is undefined and currentPrice.trialPeriodDays is null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })
  })

  describe('Null/Undefined to Value Changes', () => {
    it('should return true when newPrice.slug is set and currentPrice.slug is null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: 'new-slug',
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when newPrice.slug is set and currentPrice.slug is undefined', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: undefined,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: 'new-slug',
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when newPrice.name is set and currentPrice.name is null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        name: 'New Name',
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when newPrice.name is set and currentPrice.name is undefined', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: undefined,
      })
      const newPrice = createSubscriptionPriceInsert({
        name: 'New Name',
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when newPrice.trialPeriodDays is set and currentPrice.trialPeriodDays is null', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: 7,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Value to Null/Undefined Changes', () => {
    it('should return true when newPrice.slug changes to different value', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'old-slug',
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: 'new-slug', // Changed to different value
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when newPrice.name changes to different value', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: 'Old Name',
      })
      const newPrice = createSubscriptionPriceInsert({
        name: 'New Name', // Changed to different value
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when newPrice.trialPeriodDays is null and currentPrice.trialPeriodDays has value', () => {
      const currentPrice = createSubscriptionPriceRecord({
        trialPeriodDays: 7,
      })
      const newPrice = createSubscriptionPriceInsert({
        trialPeriodDays: null,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Multiple Field Changes', () => {
    it('should return true when multiple immutable fields changed', () => {
      const currentPrice = createSubscriptionPriceRecord({
        unitPrice: 1000,
        intervalCount: 1,
      })
      const newPrice = createSubscriptionPriceInsert({
        unitPrice: 2000, // Changed
        intervalCount: 3, // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when multiple additional fields changed', () => {
      const currentPrice = createSubscriptionPriceRecord({
        name: 'Old Name',
        slug: 'old-slug',
      })
      const newPrice = createSubscriptionPriceInsert({
        name: 'New Name', // Changed
        slug: 'new-slug', // Changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return true when mix of immutable and additional fields changed', () => {
      const currentPrice = createSubscriptionPriceRecord({
        unitPrice: 1000,
        name: 'Old Name',
      })
      const newPrice = createSubscriptionPriceInsert({
        unitPrice: 2000, // Immutable field changed
        name: 'New Name', // Additional field changed
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Price Type Variations', () => {
    it('should detect changes in subscription price intervalUnit', () => {
      const currentPrice = createSubscriptionPriceRecord({
        intervalUnit: IntervalUnit.Month,
      })
      const newPrice = createSubscriptionPriceInsert({
        intervalUnit: IntervalUnit.Year,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should detect changes in usage price usageMeterId', () => {
      const currentPrice = createUsagePriceRecord({
        usageMeterId: 'meter-1',
      })
      const newPrice = createUsagePriceInsert({
        usageMeterId: 'meter-2',
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should detect changes in usage price usageEventsPerUnit', () => {
      const currentPrice = createUsagePriceRecord({
        usageEventsPerUnit: 1,
      })
      const newPrice = createUsagePriceInsert({
        usageEventsPerUnit: 2,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should return false when all fields undefined except matching immutable fields', () => {
      const currentPrice = createSubscriptionPriceRecord({
        productId: 'product-1',
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        trialPeriodDays: 0,
      })
      const newPrice = createSubscriptionPriceInsert({
        productId: 'product-1', // Matches
        unitPrice: 1000, // Matches
        intervalUnit: IntervalUnit.Month, // Matches
        intervalCount: 1, // Matches
        trialPeriodDays: 0, // Matches
        slug: undefined,
        name: undefined,
        isDefault: undefined,
        active: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when all fields undefined except one matching additional field', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: 'test-price',
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined, // Will normalize to 'test-price'
        name: undefined,
        isDefault: undefined,
        active: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return true when all fields undefined except one differing immutable field', () => {
      const currentPrice = createSubscriptionPriceRecord({
        unitPrice: 1000,
      })
      const newPrice = createSubscriptionPriceInsert({
        unitPrice: 2000, // Differs
        slug: undefined,
        name: undefined,
        isDefault: undefined,
        active: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(true)
    })

    it('should return false when currentPrice has all nullable fields as null and newPrice has all as undefined', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: null,
        name: null,
        trialPeriodDays: null,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined,
        name: undefined,
        trialPeriodDays: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })

    it('should return false when currentPrice has nullable fields as undefined and newPrice has them as undefined', () => {
      const currentPrice = createSubscriptionPriceRecord({
        slug: undefined,
        name: undefined,
        trialPeriodDays: undefined,
      })
      const newPrice = createSubscriptionPriceInsert({
        slug: undefined,
        name: undefined,
        trialPeriodDays: undefined,
      })
      const result = isPriceChanged(newPrice, currentPrice)
      expect(result).toBe(false)
    })
  })
})
