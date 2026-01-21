import { Result } from 'better-result'
import { describe, expect, it } from 'bun:test'
import { createDefaultPlanConfig } from '@/constants/defaultPlanConfig'
import { PriceType } from '@/types'
import { validateDefaultProductSchema } from './defaultProductValidation'

describe('defaultProductValidation', () => {
  describe('validateDefaultProductSchema', () => {
    it('returns Ok for valid default product', () => {
      const product = {
        name: 'Free Plan',
        slug: 'free-plan',
        price: {
          amount: 0,
          type: PriceType.SinglePayment,
          slug: 'free',
          trialDays: 0,
        },
      }

      const result = validateDefaultProductSchema(product)
      expect(Result.isOk(result)).toBe(true)
    })

    it('returns ValidationError for product with non-zero price', () => {
      const product = {
        name: 'Paid Plan',
        slug: 'paid-plan',
        price: {
          amount: 1000,
          type: PriceType.SinglePayment,
          slug: 'paid',
          trialDays: 0,
        },
      }

      const result = validateDefaultProductSchema(product)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Default products must have zero price'
        )
      }
    })

    it('returns ValidationError for product with trial days', () => {
      const product = {
        name: 'Trial Plan',
        slug: 'trial-plan',
        price: {
          amount: 0,
          type: PriceType.SinglePayment,
          slug: 'trial',
          trialDays: 7,
        },
      }

      const result = validateDefaultProductSchema(product)
      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Default products cannot have trials'
        )
      }
    })
  })

  describe('createDefaultPlanConfig', () => {
    it('should create valid default plan config', () => {
      const config = createDefaultPlanConfig()

      expect(config.product.name).toBe('Free Plan')
      expect(config.product.slug).toBe('free')
      expect(config.product.default).toBe(true)

      expect(config.price.name).toBe('Free Plan')
      expect(config.price.slug).toBe('free')
      expect(config.price.unitPrice).toBe(0)
      expect(config.price.isDefault).toBe(true)
      expect(config.price.type).toBe(PriceType.Subscription)
      expect(config.price.intervalCount).toBe(1)
    })
  })
})
