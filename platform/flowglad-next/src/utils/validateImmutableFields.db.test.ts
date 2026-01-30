import { describe, expect, it } from 'bun:test'
import { IntervalUnit, PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { TRPCError } from '@trpc/server'
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

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).not.toThrow()
    })

    it('should allow updating mutable fields on single payment price', () => {
      const update = {
        id: singlePaymentDummyPrice.id,
        type: singlePaymentDummyPrice.type,
        name: 'Updated Single Payment',
        active: true,
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: singlePaymentDummyPrice,
        })
      ).not.toThrow()
    })

    it('should allow updating mutable fields on usage price', () => {
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        name: 'Updated Usage Price',
        isDefault: false,
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      ).not.toThrow()
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

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).not.toThrow()
    })

    it('should allow update with only id and type', () => {
      // Minimal update should work
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).not.toThrow()
    })

    it('should allow update without type field included', () => {
      // When type is omitted from update, validation should still pass
      const update = {
        id: subscriptionDummyPrice.id,
        name: 'Updated Name',
        active: false,
        // No type field
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).not.toThrow()
    })

    it('should allow update with only id and no type', () => {
      // Update with just id should work
      const update = {
        id: subscriptionDummyPrice.id,
        // No type field, no other fields
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).not.toThrow()
    })

    it('should throw error when changing immutable field even without type in update', () => {
      // Validation should catch immutable field changes even when type is omitted
      const update = {
        id: subscriptionDummyPrice.id,
        name: 'Updated Name',
        unitPrice: subscriptionDummyPrice.unitPrice + 100, // Attempting to change immutable field
        // No type field
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change unitPrice after price creation'
        )
      }
    })
  })

  describe('type field validation', () => {
    it('should throw error when changing type from Subscription to SinglePayment', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: PriceType.SinglePayment,
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change type after price creation'
        )
      }
    })

    it('should throw error when changing type from SinglePayment to Usage', () => {
      const update = {
        id: singlePaymentDummyPrice.id,
        type: PriceType.Usage,
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: singlePaymentDummyPrice,
        })
      ).toThrow(TRPCError)
    })

    it('should throw error when changing type from Usage to Subscription', () => {
      const update = {
        id: usageDummyPrice.id,
        type: PriceType.Subscription,
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      ).toThrow(TRPCError)
    })
  })

  describe('unitPrice field validation', () => {
    it('should throw error when changing unitPrice', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        unitPrice: subscriptionDummyPrice.unitPrice + 100, // Different value
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change unitPrice after price creation'
        )
      }
    })
  })

  describe('productId field validation', () => {
    it('should throw error when changing productId', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        productId: 'different-product-id',
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change productId after price creation'
        )
      }
    })
  })

  describe('interval fields validation', () => {
    it('should throw error when changing intervalUnit', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        intervalUnit: IntervalUnit.Year, // Different from Month
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change intervalUnit after price creation'
        )
      }
    })

    it('should throw error when changing intervalCount', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        intervalCount: 3, // Different from 1
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change intervalCount after price creation'
        )
      }
    })
  })

  describe('trial fields validation', () => {
    it('should throw error when changing trialPeriodDays', () => {
      const update = {
        id: subscriptionDummyPrice.id,
        type: subscriptionDummyPrice.type,
        trialPeriodDays: 30, // Different from 0
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change trialPeriodDays after price creation'
        )
      }
    })
  })

  describe('usage meter fields validation', () => {
    it('should throw error when changing usageMeterId', () => {
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        usageMeterId: 'different-meter-id',
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
          'Cannot change usageMeterId after price creation'
        )
      }
    })

    it('should throw error when changing usageEventsPerUnit', () => {
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        usageEventsPerUnit: 10, // Different from 1
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      ).toThrow(TRPCError)

      try {
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
        expect((error as TRPCError).message).toContain(
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

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: subscriptionDummyPrice,
        })
      ).not.toThrow()
    })

    it('should handle null values correctly for nullable fields', () => {
      // trialPeriodDays is null in singlePaymentDummyPrice
      const update = {
        id: singlePaymentDummyPrice.id,
        type: singlePaymentDummyPrice.type,
        trialPeriodDays: null, // Same as existing
      }

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: singlePaymentDummyPrice,
        })
      ).not.toThrow()
    })

    it('should throw when changing null to non-null value for immutable field', () => {
      // usageDummyPrice has null trialPeriodDays
      const update = {
        id: usageDummyPrice.id,
        type: usageDummyPrice.type,
        trialPeriodDays: 7 as any, // Changing from null to 7
      } as Partial<Price.Update>

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: usageDummyPrice,
        })
      ).toThrow(TRPCError)
    })

    it('should throw when changing non-null to null value for immutable field', () => {
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

      expect(() =>
        validatePriceImmutableFields({
          update,
          existing: priceWithTrial,
        })
      ).toThrow(TRPCError)
    })
  })
})
