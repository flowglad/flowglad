import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { usageCreditGrantFeatureClientInsertSchema } from './features'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'

const baseValidInput = {
  name: 'Test Feature',
  slug: 'test-feature',
  description: 'A test feature',
  pricingModelId: 'pricing-model-123',
  type: FeatureType.UsageCreditGrant as const,
  amount: 100,
  renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
}

describe('usageCreditGrantFeatureClientInsertSchema – usage meter slug support', () => {
  describe('valid inputs', () => {
    it('should accept usageMeterId only', () => {
      const result = usageCreditGrantFeatureClientInsertSchema.parse({
        ...baseValidInput,
        usageMeterId: 'usage-meter-123',
      })
      expect(result.usageMeterId).toBe('usage-meter-123')
      expect(result.usageMeterSlug).toBeUndefined()
    })

    it('should accept usageMeterSlug only', () => {
      const result = usageCreditGrantFeatureClientInsertSchema.parse({
        ...baseValidInput,
        usageMeterSlug: 'api-calls',
      })
      expect(result.usageMeterSlug).toBe('api-calls')
      expect(result.usageMeterId).toBeUndefined()
    })
  })

  describe('invalid inputs - mutual exclusivity', () => {
    it('should reject when both usageMeterId and usageMeterSlug are provided', () => {
      expect(() => {
        usageCreditGrantFeatureClientInsertSchema.parse({
          ...baseValidInput,
          usageMeterId: 'usage-meter-123',
          usageMeterSlug: 'api-calls',
        })
      }).toThrow(
        'Either usageMeterId or usageMeterSlug must be provided, but not both'
      )
    })

    it('should reject when neither usageMeterId nor usageMeterSlug is provided', () => {
      expect(() => {
        usageCreditGrantFeatureClientInsertSchema.parse({
          ...baseValidInput,
        })
      }).toThrow(
        'Either usageMeterId or usageMeterSlug must be provided, but not both'
      )
    })
  })
})
