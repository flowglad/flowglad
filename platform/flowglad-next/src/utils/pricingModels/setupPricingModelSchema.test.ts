import { describe, expect, it } from 'vitest'
import { FeatureType, IntervalUnit, PriceType } from '@/types'
import type { SetupPricingModelInput } from './setupSchemas'
import { setupPricingModelSchema } from './setupSchemas'

describe('setupPricingModelSchema', () => {
  // Helper function to create a minimal valid input
  const createMinimalValidInput = (): SetupPricingModelInput => ({
    name: 'Test Pricing Model',
    isDefault: false,
    features: [],
    products: [
      {
        product: {
          name: 'Test Product',
          slug: 'test-product',
          active: true,
          default: false,
        },
        price: {
          type: PriceType.Subscription,
          slug: 'test-price',
          isDefault: true,
          unitPrice: 1000,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageMeterId: null,
          usageEventsPerUnit: null,
          active: true,
        },
        features: [],
      },
    ],
    usageMeters: [],
  })

  describe('unique slug validation', () => {
    it('should reject when features have duplicate slugs', () => {
      const input = createMinimalValidInput()
      input.features = [
        {
          type: FeatureType.Toggle,
          slug: 'duplicate-slug',
          name: 'Feature 1',
          description: 'Description 1',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'duplicate-slug',
          name: 'Feature 2',
          description: 'Description 2',
          active: true,
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Features must have unique slugs'
        )
      }
    })

    it('should accept when all feature slugs are unique', () => {
      const input = createMinimalValidInput()
      input.features = [
        {
          type: FeatureType.Toggle,
          slug: 'feature-1',
          name: 'Feature 1',
          description: 'Description 1',
          active: true,
        },
        {
          type: FeatureType.Toggle,
          slug: 'feature-2',
          name: 'Feature 2',
          description: 'Description 2',
          active: true,
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should reject when products have duplicate slugs', () => {
      const input = createMinimalValidInput()
      input.products = [
        {
          product: {
            name: 'Product 1',
            slug: 'duplicate-slug',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'price-1',
            isDefault: true,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: [],
        },
        {
          product: {
            name: 'Product 2',
            slug: 'duplicate-slug',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'price-2',
            isDefault: true,
            unitPrice: 2000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: [],
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Products must have unique slugs'
        )
      }
    })

    it('should accept when all product slugs are unique', () => {
      const input = createMinimalValidInput()
      input.products = [
        {
          product: {
            name: 'Product 1',
            slug: 'product-1',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'price-1',
            isDefault: true,
            unitPrice: 1000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: [],
        },
        {
          product: {
            name: 'Product 2',
            slug: 'product-2',
            active: true,
            default: false,
          },
          price: {
            type: PriceType.Subscription,
            slug: 'price-2',
            isDefault: true,
            unitPrice: 2000,
            intervalUnit: IntervalUnit.Month,
            intervalCount: 1,
            usageMeterId: null,
            usageEventsPerUnit: null,
            active: true,
          },
          features: [],
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    // PR 5: Usage meters now use nested structure with prices
    it('should reject when usage meters have duplicate slugs', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'duplicate-slug',
            name: 'Usage Meter 1',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price-1',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
        {
          usageMeter: {
            slug: 'duplicate-slug',
            name: 'Usage Meter 2',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price-2',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Usage meters must have unique slugs'
        )
      }
    })

    // PR 5: Usage meters now use nested structure with prices
    it('should accept when all usage meter slugs are unique', () => {
      const input = createMinimalValidInput()
      input.usageMeters = [
        {
          usageMeter: {
            slug: 'meter-1',
            name: 'Usage Meter 1',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price-1',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
        {
          usageMeter: {
            slug: 'meter-2',
            name: 'Usage Meter 2',
          },
          prices: [
            {
              type: PriceType.Usage,
              slug: 'usage-price-2',
              isDefault: true,
              unitPrice: 100,
              intervalUnit: IntervalUnit.Month,
              intervalCount: 1,
              trialPeriodDays: null,
              usageEventsPerUnit: 1,
              active: true,
            },
          ],
        },
      ]

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('isDefault field behavior', () => {
    it('should default to false when not provided', () => {
      const input = createMinimalValidInput()
      // @ts-expect-error - Intentionally deleting required property to test default behavior
      delete input.isDefault

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isDefault).toBe(false)
      }
    })

    it('should accept true when explicitly provided', () => {
      const input = createMinimalValidInput()
      input.isDefault = true

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isDefault).toBe(true)
      }
    })

    it('should accept false when explicitly provided', () => {
      const input = createMinimalValidInput()
      input.isDefault = false

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.isDefault).toBe(false)
      }
    })
  })

  describe('empty arrays', () => {
    it('should accept empty features array', () => {
      const input = createMinimalValidInput()
      input.features = []

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should accept empty usageMeters array', () => {
      const input = createMinimalValidInput()
      input.usageMeters = []

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('name field validation', () => {
    it('should reject empty name', () => {
      const input = createMinimalValidInput()
      input.name = ''

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should reject name that is only whitespace', () => {
      const input = createMinimalValidInput()
      input.name = '   '

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should trim leading/trailing whitespace from name', () => {
      const input = createMinimalValidInput()
      input.name = '  Test Model  '

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('Test Model')
      }
    })
  })

  describe('product price requirement validation', () => {
    it('should reject when price has active=false', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'price-1',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: false, // Invalid
      }

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'active=true'
        )
      }
    })

    it('should reject when price has isDefault=false', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'price-1',
        isDefault: false, // Invalid
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      }

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'isDefault=true'
        )
      }
    })

    it('should accept when price has both active=true and isDefault=true', () => {
      const input = createMinimalValidInput()
      input.products[0].price = {
        type: PriceType.Subscription,
        slug: 'price-1',
        isDefault: true,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        usageMeterId: null,
        usageEventsPerUnit: null,
        active: true,
      }

      const result = setupPricingModelSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })
})
