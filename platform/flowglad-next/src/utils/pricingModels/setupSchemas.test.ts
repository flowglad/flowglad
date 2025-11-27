import { describe, expect, it } from 'vitest'
import { PRICING_MODEL_TEMPLATES } from '@/constants/pricingModelTemplates'
import { PriceType } from '@/types'
import {
  sanitizedStringSchema,
  validateSetupPricingModelInput,
} from './setupSchemas'

describe('sanitizedStringSchema', () => {
  it('should validate basic string requirements', () => {
    const result = sanitizedStringSchema.safeParse('valid string')
    expect(result.success).toBe(true)
  })

  it('should reject empty strings', () => {
    const result = sanitizedStringSchema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Field is required')
    }
  })

  it('should reject strings that are only whitespace', () => {
    const result = sanitizedStringSchema.safeParse('   ')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Field is required')
    }
  })

  it('should reject strings that are too long', () => {
    const longString = 'a'.repeat(256) // 256 characters, exceeds 255 limit
    const result = sanitizedStringSchema.safeParse(longString)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Field must be less than 255 characters'
      )
    }
  })

  it('should trim leading/trailing whitespace (NOW sanitized)', () => {
    const result = sanitizedStringSchema.safeParse('  hello world  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('hello world') // Note: whitespace is now trimmed
    }
  })

  it('should accept strings with mixed case (NOT sanitized)', () => {
    const result = sanitizedStringSchema.safeParse('Hello World')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Hello World') // Note: case is preserved
    }
  })

  it('should accept strings with special characters (NOT sanitized)', () => {
    const result = sanitizedStringSchema.safeParse('Hello@World#123')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Hello@World#123') // Note: special chars are preserved
    }
  })
})

describe('validateSetupPricingModelInput', () => {
  it('should throw if a usage meter has no associated usage price', () => {
    const templateWithUsageMeter = PRICING_MODEL_TEMPLATES.find(
      (template) => template.input.usageMeters.length > 0
    )

    if (!templateWithUsageMeter) {
      throw new Error(
        'Expected at least one template with a usage meter for this test'
      )
    }

    const invalidInput = JSON.parse(
      JSON.stringify(templateWithUsageMeter.input)
    )

    invalidInput.products = invalidInput.products.map(
      (product: any) => ({
        ...product,
        prices: product.prices.filter(
          (price: any) => price.type !== PriceType.Usage
        ),
      })
    )

    expect(() =>
      validateSetupPricingModelInput(invalidInput)
    ).toThrow(
      /Usage meter with slug .+ must have at least one usage price associated with it/
    )
  })
})
