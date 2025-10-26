import { describe, expect, it } from 'vitest'
import { sanitizedStringSchema } from './setupSchemas'

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
