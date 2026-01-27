import { describe, expect, it } from 'bun:test'
import { core, safeZodSanitizedString } from '@/utils/core'

describe('customerBillingPortalURL', () => {
  it('creates correct URL for billing portal with customerId', () => {
    const url = core.customerBillingPortalURL({
      organizationId: 'organizationid',
      customerId: 'customerid',
    })
    expect(url).toBe(
      'http://localhost:3000/billing-portal/organizationid/customerid'
    )
  })

  it('creates correct URL for billing portal without customerId', () => {
    const url = core.customerBillingPortalURL({
      organizationId: 'organizationid',
    })
    expect(url).toBe(
      'http://localhost:3000/billing-portal/organizationid/'
    )
  })
})

describe('organizationBillingPortalURL', () => {
  it('creates correct URL for billing portal with organization ID only', () => {
    const url = core.organizationBillingPortalURL({
      organizationId: 'organizationid',
    })
    expect(url).toBe(
      'http://localhost:3000/billing-portal/organizationid'
    )
  })
})

describe('safeZodNullOrUndefined', () => {
  it('should return null for null', () => {
    const result = core.safeZodNullOrUndefined.parse(null)
    expect(result).toBe(null)
  })
  it('should return null for undefined', () => {
    const result = core.safeZodNullOrUndefined.parse(undefined)
    expect(result).toBe(null)
  })
})

describe('safeZodSanitizedString', () => {
  it('should validate basic string requirements', () => {
    const result = safeZodSanitizedString.safeParse('valid string')
    expect(result.success).toBe(true)
  })

  it('should reject empty strings', () => {
    const result = safeZodSanitizedString.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Field is required')
    }
  })

  it('should reject strings that are only whitespace', () => {
    const result = safeZodSanitizedString.safeParse('   ')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Field is required')
    }
  })

  it('should reject strings that are too long', () => {
    const longString = 'a'.repeat(256) // 256 characters, exceeds 255 limit
    const result = safeZodSanitizedString.safeParse(longString)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Field must be less than 255 characters'
      )
    }
  })

  it('should trim leading/trailing whitespace (NOW sanitized)', () => {
    const result = safeZodSanitizedString.safeParse('  hello world  ')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('hello world') // Note: whitespace is now trimmed
    }
  })

  it('should accept strings with mixed case (NOT sanitized)', () => {
    const result = safeZodSanitizedString.safeParse('Hello World')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Hello World') // Note: case is preserved
    }
  })

  it('should accept strings with special characters (NOT sanitized)', () => {
    const result = safeZodSanitizedString.safeParse('Hello@World#123')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('Hello@World#123') // Note: special chars are preserved
    }
  })
})
