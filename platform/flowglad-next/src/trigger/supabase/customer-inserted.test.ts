import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/errors'
import { validateCustomerInsertPayload } from './customer-inserted'

describe('validateCustomerInsertPayload', () => {
  it('returns ValidationError when payload is missing required fields', () => {
    const invalidPayload = {
      table: 'customers',
      schema: 'public',
      type: 'INSERT',
      record: {
        // Missing required fields like id, email, name, organizationId, etc.
      },
    }

    const result = validateCustomerInsertPayload(
      invalidPayload as never
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
      expect(result.error._tag).toBe('ValidationError')
      expect(result.error.field).toBe('payload')
      expect(result.error.reason).toBe('Invalid payload')
    }
  })

  it('returns ValidationError when payload has invalid type field', () => {
    const invalidPayload = {
      table: 'customers',
      schema: 'public',
      type: 'INVALID_TYPE', // Invalid type
      record: {
        id: 'cust_123',
        email: 'test@example.com',
      },
    }

    const result = validateCustomerInsertPayload(
      invalidPayload as never
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
      expect(result.error._tag).toBe('ValidationError')
    }
  })

  it('returns ValidationError when payload is completely empty', () => {
    const result = validateCustomerInsertPayload({} as never)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
    }
  })
})
