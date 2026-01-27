import { describe, expect, it } from 'bun:test'
import { ValidationError } from '@/errors'
import { validateCustomerInsertPayload } from './customer-inserted'

describe('validateCustomerInsertPayload', () => {
  it('returns Result.ok with validated payload when all required fields are present', () => {
    const validPayload = {
      table: 'customers',
      schema: 'public',
      type: 'INSERT',
      record: {
        id: 'cust_123',
        email: 'test@example.com',
        name: 'Test Customer',
        organizationId: 'org_123',
        externalId: 'ext_123',
        pricingModelId: 'pm_123',
        livemode: true,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 1,
        stripeCustomerId: null,
        taxId: null,
        logoURL: null,
        iconURL: null,
        domain: null,
        billingAddress: null,
        userId: null,
        invoiceNumberBase: 'INV-001',
        stackAuthHostedBillingUserId: null,
      },
    }

    const result = validateCustomerInsertPayload(
      validPayload as never
    )

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.value.record.id).toBe('cust_123')
      expect(result.value.record.email).toBe('test@example.com')
      expect(result.value.record.name).toBe('Test Customer')
      expect(result.value.record.organizationId).toBe('org_123')
    }
  })

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
