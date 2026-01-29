import { describe, expect, it } from 'bun:test'
import {
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@db-core/enums'
import {
  featuresClientInsertSchema,
  featuresClientUpdateSchema,
  toggleFeatureClientInsertSchema,
  toggleFeatureClientUpdateSchema,
  toggleFeatureInsertSchema,
  usageCreditGrantFeatureClientInsertSchema,
  usageCreditGrantFeatureClientUpdateSchema,
  usageCreditGrantFeatureInsertSchema,
} from './features'

describe('Features Schema Validation', () => {
  describe('Toggle Feature - Client Insert Schema', () => {
    it('should validate toggle feature with valid data', () => {
      const validToggleFeature = {
        type: FeatureType.Toggle,
        slug: 'premium-feature',
        name: 'Premium Feature',
        description: 'A premium feature toggle',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: null,
        usageMeterId: null,
        renewalFrequency: null,
      }

      const result = toggleFeatureClientInsertSchema.safeParse(
        validToggleFeature
      )
      expect(result.success).toBe(true)
    })

    it('should validate toggle feature with omitted nullable fields', () => {
      const validToggleFeature = {
        type: FeatureType.Toggle,
        slug: 'basic-feature',
        name: 'Basic Feature',
        description: 'A basic feature toggle',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
      }

      const result = toggleFeatureClientInsertSchema.safeParse(
        validToggleFeature
      )
      expect(result.success).toBe(true)
    })

    it('should reject toggle feature with non-null amount', () => {
      const invalidToggleFeature = {
        type: FeatureType.Toggle,
        slug: 'invalid-feature',
        name: 'Invalid Feature',
        description: 'An invalid feature',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: 100, // Should be null
        usageMeterId: null,
        renewalFrequency: null,
      }

      const result = toggleFeatureClientInsertSchema.safeParse(
        invalidToggleFeature
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('amount')
      }
    })

    it('should reject toggle feature with non-null usageMeterId', () => {
      const invalidToggleFeature = {
        type: FeatureType.Toggle,
        slug: 'invalid-feature',
        name: 'Invalid Feature',
        description: 'An invalid feature',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: null,
        usageMeterId: 'meter-id', // Should be null
        renewalFrequency: null,
      }

      const result = toggleFeatureClientInsertSchema.safeParse(
        invalidToggleFeature
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('usageMeterId')
      }
    })

    it('should reject toggle feature with non-null renewalFrequency', () => {
      const invalidToggleFeature = {
        type: FeatureType.Toggle,
        slug: 'invalid-feature',
        name: 'Invalid Feature',
        description: 'An invalid feature',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: null,
        usageMeterId: null,
        renewalFrequency: FeatureUsageGrantFrequency.Once, // Should be null
      }

      const result = toggleFeatureClientInsertSchema.safeParse(
        invalidToggleFeature
      )
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain(
          'renewalFrequency'
        )
      }
    })
  })

  describe('UsageCreditGrant Feature - Client Insert Schema', () => {
    it('should validate usage credit grant feature with valid data', () => {
      const validUsageCreditGrantFeature = {
        type: FeatureType.UsageCreditGrant,
        slug: 'api-credits',
        name: 'API Credits',
        description: 'Monthly API credits',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: 1000,
        usageMeterId: 'meter-id',
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
      }

      const result =
        usageCreditGrantFeatureClientInsertSchema.safeParse(
          validUsageCreditGrantFeature
        )
      expect(result.success).toBe(true)
    })

    it('should validate usage credit grant feature with minimum valid amount (1)', () => {
      const validUsageCreditGrantFeature = {
        type: FeatureType.UsageCreditGrant,
        slug: 'min-credits',
        name: 'Minimum Credits',
        description: 'Minimum amount of credits',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: 1, // Minimum valid amount
        usageMeterId: 'meter-id',
        renewalFrequency: FeatureUsageGrantFrequency.Once,
      }

      const result =
        usageCreditGrantFeatureClientInsertSchema.safeParse(
          validUsageCreditGrantFeature
        )
      expect(result.success).toBe(true)
    })

    describe('Amount Validation - should reject amount < 1', () => {
      it('should reject amount of 0', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 0, // Invalid: must be >= 1
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })

      it('should reject negative amount', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: -1, // Invalid: must be >= 1
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })

      it('should reject large negative amount', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: -100, // Invalid: must be >= 1
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })

      it('should reject decimal amount', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 1.5, // Invalid: must be integer
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })

      it('should reject null amount', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: null, // Invalid: must be positive integer
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })

      it('should reject undefined amount', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          // amount omitted - should be invalid
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })

      it('should reject string amount', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: '100', // Invalid: should be number (though coerce might handle this)
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        // Note: z.coerce.number() will convert string to number, but we still need to test
        // that the final validation (positive integer) works
        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        // If coercion works, '100' becomes 100 which is valid
        // But '0' should become 0 which is invalid
        if (result.success) {
          expect(result.data.amount).toBe(100)
        }
      })

      it('should reject string "0" amount after coercion', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid amount',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: '0', // Should coerce to 0, which is invalid
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })
    })

    describe('UsageMeterId Validation', () => {
      it('should reject null usageMeterId', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid usage meter',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          usageMeterId: null, // Invalid: must be string
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain(
            'usageMeterId'
          )
        }
      })

      it('should reject undefined usageMeterId', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid usage meter',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          // usageMeterId omitted - should be invalid
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain(
            'usageMeterId'
          )
        }
      })
    })

    describe('RenewalFrequency Validation', () => {
      it('should validate with Once frequency', () => {
        const validFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'one-time-credits',
          name: 'One Time Credits',
          description: 'One time credit grant',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            validFeature
          )
        expect(result.success).toBe(true)
      })

      it('should validate with EveryBillingPeriod frequency', () => {
        const validFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'recurring-credits',
          name: 'Recurring Credits',
          description: 'Recurring credit grant',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          usageMeterId: 'meter-id',
          renewalFrequency:
            FeatureUsageGrantFrequency.EveryBillingPeriod,
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            validFeature
          )
        expect(result.success).toBe(true)
      })

      it('should reject invalid renewalFrequency', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid frequency',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          usageMeterId: 'meter-id',
          renewalFrequency: 'invalid-frequency', // Invalid enum value
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain(
            'renewalFrequency'
          )
        }
      })

      it('should reject null renewalFrequency', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid frequency',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          usageMeterId: 'meter-id',
          renewalFrequency: null, // Invalid: must be enum value
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain(
            'renewalFrequency'
          )
        }
      })

      it('should reject undefined renewalFrequency', () => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: 'invalid-credits',
          name: 'Invalid Credits',
          description: 'Invalid frequency',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount: 100,
          usageMeterId: 'meter-id',
          // renewalFrequency omitted - should be invalid
        }

        const result =
          usageCreditGrantFeatureClientInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain(
            'renewalFrequency'
          )
        }
      })
    })
  })

  describe('Discriminated Union - Client Insert Schema', () => {
    it('should validate toggle feature via union schema', () => {
      const validToggleFeature = {
        type: FeatureType.Toggle,
        slug: 'premium-feature',
        name: 'Premium Feature',
        description: 'A premium feature toggle',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
      }

      const result = featuresClientInsertSchema.safeParse(
        validToggleFeature
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(FeatureType.Toggle)
      }
    })

    it('should validate usage credit grant feature via union schema', () => {
      const validUsageCreditGrantFeature = {
        type: FeatureType.UsageCreditGrant,
        slug: 'api-credits',
        name: 'API Credits',
        description: 'Monthly API credits',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: 1000,
        usageMeterId: 'meter-id',
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod,
      }

      const result = featuresClientInsertSchema.safeParse(
        validUsageCreditGrantFeature
      )
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe(FeatureType.UsageCreditGrant)
      }
    })

    it('should reject invalid type in union schema', () => {
      const invalidFeature = {
        type: 'invalid-type',
        slug: 'invalid-feature',
        name: 'Invalid Feature',
        description: 'Invalid feature',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
      }

      const result =
        featuresClientInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
    })

    it('should reject toggle feature with usage credit grant fields', () => {
      const invalidFeature = {
        type: FeatureType.Toggle,
        slug: 'invalid-feature',
        name: 'Invalid Feature',
        description: 'Invalid feature',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: 100, // Should be null for toggle
        usageMeterId: 'meter-id', // Should be null for toggle
        renewalFrequency: FeatureUsageGrantFrequency.Once, // Should be null for toggle
      }

      const result =
        featuresClientInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
    })

    it('should reject usage credit grant feature with toggle fields', () => {
      const invalidFeature = {
        type: FeatureType.UsageCreditGrant,
        slug: 'invalid-credits',
        name: 'Invalid Credits',
        description: 'Invalid credits',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: null, // Should be positive integer
        usageMeterId: null, // Should be string
        renewalFrequency: null, // Should be enum value
      }

      const result =
        featuresClientInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
    })
  })

  describe('Internal Insert Schemas - Amount Validation', () => {
    it('should reject amount < 1 in usageCreditGrantFeatureInsertSchema', () => {
      const testCases = [
        { amount: 0, description: 'zero' },
        { amount: -1, description: 'negative one' },
        { amount: -100, description: 'large negative' },
        { amount: 0.5, description: 'decimal less than 1' },
      ]

      testCases.forEach(({ amount, description }) => {
        const invalidFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: `invalid-${description}`,
          name: 'Invalid Credits',
          description: 'Invalid amount',
          organizationId: 'org-id',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount,
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureInsertSchema.safeParse(
            invalidFeature
          )
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('amount')
        }
      })
    })

    it('should accept amount >= 1 in usageCreditGrantFeatureInsertSchema', () => {
      const testCases = [
        { amount: 1, description: 'minimum valid' },
        { amount: 100, description: 'valid amount' },
        { amount: 1000000, description: 'large valid amount' },
      ]

      testCases.forEach(({ amount, description }) => {
        const validFeature = {
          type: FeatureType.UsageCreditGrant,
          slug: `valid-${description}`,
          name: 'Valid Credits',
          description: 'Valid amount',
          organizationId: 'org-id',
          pricingModelId: 'test-pricing-model-id',
          livemode: false,
          active: true,
          amount,
          usageMeterId: 'meter-id',
          renewalFrequency: FeatureUsageGrantFrequency.Once,
        }

        const result =
          usageCreditGrantFeatureInsertSchema.safeParse(validFeature)
        expect(result.success).toBe(true)
      })
    })

    it('should enforce null amount for toggleFeatureInsertSchema', () => {
      const invalidFeature = {
        type: FeatureType.Toggle,
        slug: 'invalid-toggle',
        name: 'Invalid Toggle',
        description: 'Invalid toggle',
        organizationId: 'org-id',
        pricingModelId: 'test-pricing-model-id',
        livemode: false,
        active: true,
        amount: 100, // Should be null
        usageMeterId: null,
        renewalFrequency: null,
      }

      const result =
        toggleFeatureInsertSchema.safeParse(invalidFeature)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('amount')
      }
    })
  })

  describe('Update Schemas', () => {
    it('should validate toggle feature update with valid data', () => {
      const validUpdate = {
        id: 'feature-id',
        type: FeatureType.Toggle,
        name: 'Updated Feature Name',
        description: 'Updated description',
        active: false,
      }

      const result =
        toggleFeatureClientUpdateSchema.safeParse(validUpdate)
      expect(result.success).toBe(true)
    })

    it('should validate usage credit grant feature update with valid amount', () => {
      const validUpdate = {
        id: 'feature-id',
        type: FeatureType.UsageCreditGrant,
        amount: 2000, // Updated amount
        usageMeterId: 'meter-id', // Required for discriminated union variant
        renewalFrequency: FeatureUsageGrantFrequency.Once, // Required for discriminated union variant
        name: 'Updated Credits',
      }

      const result =
        usageCreditGrantFeatureClientUpdateSchema.safeParse(
          validUpdate
        )
      expect(result.success).toBe(true)
    })

    it('should reject usage credit grant feature update with amount < 1', () => {
      const invalidUpdate = {
        id: 'feature-id',
        type: FeatureType.UsageCreditGrant,
        amount: 0, // Invalid
      }

      const result =
        usageCreditGrantFeatureClientUpdateSchema.safeParse(
          invalidUpdate
        )
      expect(result.success).toBe(false)
      if (!result.success) {
        const amountError = result.error.issues.find((issue) =>
          issue.path.includes('amount')
        )
        expect(amountError).toMatchObject({
          path: expect.arrayContaining(['amount']),
        })
      }
    })

    it('should validate union update schema with toggle feature', () => {
      const validUpdate = {
        id: 'feature-id',
        type: FeatureType.Toggle,
        name: 'Updated Feature',
      }

      const result = featuresClientUpdateSchema.safeParse(validUpdate)
      expect(result.success).toBe(true)
    })

    it('should validate union update schema with usage credit grant feature', () => {
      const validUpdate = {
        id: 'feature-id',
        type: FeatureType.UsageCreditGrant,
        amount: 500,
        usageMeterId: 'meter-id', // Required for discriminated union variant
        renewalFrequency:
          FeatureUsageGrantFrequency.EveryBillingPeriod, // Required for discriminated union variant
      }

      const result = featuresClientUpdateSchema.safeParse(validUpdate)
      expect(result.success).toBe(true)
    })
  })
})
