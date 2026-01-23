import { describe, expect, it } from 'bun:test'
import { productsClientInsertSchema } from './products'

describe('Products Schema Validation', () => {
  describe('productsClientInsertSchema - Slug validation', () => {
    it('should allow "free" slug for default products', () => {
      const validData = {
        name: 'Free Plan',
        slug: 'free',
        default: true,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject "free" slug for non-default products', () => {
      const invalidData = {
        name: 'Free Plan',
        slug: 'free',
        default: false,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Slug 'free' is reserved for default products only"
        )
        expect(result.error.issues[0].path).toEqual(['slug'])
      }
    })

    it('should allow non-"free" slugs for non-default products', () => {
      const validData = {
        name: 'Premium Plan',
        slug: 'premium',
        default: false,
        description: 'A premium plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should allow non-"free" slugs for default products', () => {
      const validData = {
        name: 'Default Plan',
        slug: 'default-plan',
        default: true,
        description: 'A default plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe('Case sensitivity and whitespace normalization', () => {
    it('should reject "Free" (capitalized) slug for non-default products', () => {
      const invalidData = {
        name: 'Free Plan',
        slug: 'Free',
        default: false,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Slug 'free' is reserved for default products only"
        )
        expect(result.error.issues[0].path).toEqual(['slug'])
      }
    })

    it('should reject " FREE " (with whitespace) slug for non-default products', () => {
      const invalidData = {
        name: 'Free Plan',
        slug: ' FREE ',
        default: false,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Slug 'free' is reserved for default products only"
        )
        expect(result.error.issues[0].path).toEqual(['slug'])
      }
    })

    it('should reject "FrEe" (mixed case) slug for non-default products', () => {
      const invalidData = {
        name: 'Free Plan',
        slug: 'FrEe',
        default: false,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(invalidData)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "Slug 'free' is reserved for default products only"
        )
        expect(result.error.issues[0].path).toEqual(['slug'])
      }
    })

    it('should allow "Free" (capitalized) slug for default products', () => {
      const validData = {
        name: 'Free Plan',
        slug: 'Free',
        default: true,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should allow " FREE " (with whitespace) slug for default products', () => {
      const validData = {
        name: 'Free Plan',
        slug: ' FREE ',
        default: true,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should allow "FrEe" (mixed case) slug for default products', () => {
      const validData = {
        name: 'Free Plan',
        slug: 'FrEe',
        default: true,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty slug gracefully', () => {
      const validData = {
        name: 'Test Plan',
        slug: '',
        default: false,
        description: 'A test plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      // Empty slug should be allowed (not treated as 'free')
      expect(result.success).toBe(true)
    })

    it('should handle null slug gracefully', () => {
      const validData = {
        name: 'Test Plan',
        slug: null,
        default: false,
        description: 'A test plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      // Null slug should be allowed (not treated as 'free')
      expect(result.success).toBe(true)
    })

    it('should not treat "FreePlan" as "free"', () => {
      const validData = {
        name: 'Free Plan',
        slug: 'FreePlan',
        default: false,
        description: 'A free plan',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should not treat "freeTrial" as "free"', () => {
      const validData = {
        name: 'Free Trial',
        slug: 'freeTrial',
        default: false,
        description: 'A free trial',
        imageURL: null,
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        singularQuantityLabel: 'seat',
        pluralQuantityLabel: 'seats',
      }

      const result = productsClientInsertSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })
  })
})
