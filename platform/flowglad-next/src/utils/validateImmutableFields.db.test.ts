import { describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { Result } from 'better-result'
import {
  singlePaymentDummyPrice,
  subscriptionDummyPrice,
  usageDummyPrice,
} from '@/stubs/priceStubs'
import { validatePriceImmutableFields } from './validateImmutableFields'

describe('validatePriceImmutableFields', () => {
  describe('successful validation', () => {
    it('should allow updating mutable fields on subscription price', () => {
      // Test that we can update name, active, slug, isDefault without errors
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        name: 'Updated Name',
        active: false,
        slug: 'new-slug',
        isDefault: true,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should allow updating mutable fields on single payment price', () => {
      const update = {
        id: singlePaymentDummyPrice.id,
        type: singlePaymentDummyPrice.type,
        name: 'Updated Single Payment',
        active: true,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: singlePaymentDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should allow updating mutable fields on usage price', () => {
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        name: 'Updated Usage Price',
        isDefault: false,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: usageDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should allow update when immutable fields are included with same values', () => {
      // Including immutable fields with unchanged values should be allowed
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        name: 'Updated Name',
        unitPrice: subscriptionDummyPrice.unitPrice, // Same value
        intervalUnit: subscriptionDummyPrice.intervalUnit, // Same value
        intervalCount: subscriptionDummyPrice.intervalCount, // Same value
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should allow update with only id and type', () => {
      // Minimal update should work
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should allow update without type field included', () => {
      // When type is omitted from update, validation should still pass
      const update = {
        id: subscriptionDummyPrice.id,
        name: 'Updated Name',
        active: false,
        // No type field
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should allow update with only id and no type', () => {
      // Update with just id should work
      const update = {
        id: subscriptionDummyPrice.id,
        // No type field, no other fields
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should return error when changing immutable field even without type in update', () => {
      // Validation should catch immutable field changes even when type is omitted
      const update = {
        id: subscriptionDummyPrice.id,
        name: 'Updated Name',
        unitPrice: subscriptionDummyPrice.unitPrice + 100, // Attempting to change immutable field
        // No type field
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change unitPrice after price creation'
        )
      }
    })
  })

  describe('type field validation', () => {
    it('should return error when changing type from Subscription to SinglePayment', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: PriceType.SinglePayment,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change type after price creation'
        )
      }
    })

    it('should return error when changing type from SinglePayment to Usage', () => {
      const update = {
        id: singlePaymentDummyPrice.id,
        type: PriceType.Usage,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: singlePaymentDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
    })

    it('should return error when changing type from Usage to Subscription', () => {
      const update = {
        id: usageDummyPrice.id,
        type: PriceType.Subscription,
      }

      const result = validatePriceImmutableFields({
        update,
        existing: usageDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
    })
  })

  describe('unitPrice field validation', () => {
    it('should return error when changing unitPrice', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        unitPrice: subscriptionDummyPrice.unitPrice + 100, // Different value
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change unitPrice after price creation'
        )
      }
    })
  })

  describe('productId field validation', () => {
    it('should return error when changing productId', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        productId: 'different-product-id',
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change productId after price creation'
        )
      }
    })
  })

  describe('interval fields validation', () => {
    it('should return error when changing intervalUnit', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        intervalUnit: IntervalUnit.Year, // Different from Month
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change intervalUnit after price creation'
        )
      }
    })

    it('should return error when changing intervalCount', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        intervalCount: 3, // Different from 1
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change intervalCount after price creation'
        )
      }
    })
  })

  describe('trial fields validation', () => {
    it('should return error when changing trialPeriodDays', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        trialPeriodDays: 30, // Different from 0
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change trialPeriodDays after price creation'
        )
      }
    })
  })

  describe('usage meter fields validation', () => {
    it('should return error when changing usageMeterId', () => {
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        usageMeterId: 'different-meter-id',
      }

      const result = validatePriceImmutableFields({
        update,
        existing: usageDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change usageMeterId after price creation'
        )
      }
    })

    it('should return error when changing usageEventsPerUnit', () => {
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        usageEventsPerUnit: 10, // Different from 1
      }

      const result = validatePriceImmutableFields({
        update,
        existing: usageDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error._tag).toBe('ValidationError')
        expect(result.error.message).toContain(
          'Cannot change usageEventsPerUnit after price creation'
        )
      }
    })
  })

  describe('edge cases', () => {
    it('should allow update when immutable fields are undefined in update', () => {
      // When fields are not present in update, validation should pass
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        name: 'Updated Name',
        // No immutable fields included
      }

      const result = validatePriceImmutableFields({
        update,
        existing: subscriptionDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should handle null values correctly for nullable fields', () => {
      // trialPeriodDays is null in singlePaymentDummyPrice
      const update = {
        id: singlePaymentDummyPrice.id,
        type: singlePaymentDummyPrice.type,
        trialPeriodDays: null, // Same as existing
      }

      const result = validatePriceImmutableFields({
        update,
        existing: singlePaymentDummyPrice,
      })

      expect(Result.isOk(result)).toBe(true)
    })

    it('should return error when changing null to non-null value for immutable field', () => {
      // usageDummyPrice has null trialPeriodDays
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        trialPeriodDays: 7 as any, // Changing from null to 7
      } as Partial<Price.Update>

      const result = validatePriceImmutableFields({
        update,
        existing: usageDummyPrice,
      })

      expect(Result.isError(result)).toBe(true)
    })

    it('should return error when changing non-null to null value for immutable field', () => {
      // Create a price with non-null trialPeriodDays
      const priceWithTrial = {
        ...subscriptionDummyPrice,
        trialPeriodDays: 7, // Non-null value
      } as Price.Record

      const update = {
        id: priceWithTrial.id,
        type: priceWithTrial.type,
        trialPeriodDays: null as any, // Changing from 7 to null
      } as Partial<Price.Update>

      const result = validatePriceImmutableFields({
        update,
        existing: priceWithTrial,
      })

      expect(Result.isError(result)).toBe(true)
    })
  })
})
