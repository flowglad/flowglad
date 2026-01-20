import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/errors'
import { validateEventInsertPayload } from './event-inserted'

describe('validateEventInsertPayload', () => {
  it('returns ValidationError when payload is missing required fields', () => {
    const invalidPayload = {
      table: 'events',
      schema: 'public',
      type: 'INSERT',
      record: {
        // Missing required fields like id, type, organization_id, etc.
      },
    }

    const result = validateEventInsertPayload(invalidPayload as never)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
      expect(result.error._tag).toBe('ValidationError')
      expect(result.error.field).toBe('payload')
      expect(result.error.reason).toBe('Invalid payload')
    }
  })

  it('returns ValidationError when payload has invalid event type', () => {
    const invalidPayload = {
      table: 'events',
      schema: 'public',
      type: 'INSERT',
      record: {
        id: 'evt_123',
        type: 'invalid.event.type', // Invalid event type
        organization_id: 'org_123',
        livemode: true,
        payload: { object: 'payment', id: 'pay_123' },
        hash: 'abc123',
        metadata: {},
      },
    }

    const result = validateEventInsertPayload(invalidPayload as never)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
      expect(result.error._tag).toBe('ValidationError')
    }
  })

  it('returns ValidationError when record is empty', () => {
    const payloadWithEmptyRecord = {
      table: 'events',
      schema: 'public',
      type: 'INSERT',
      record: {},
    }
    const result = validateEventInsertPayload(
      payloadWithEmptyRecord as never
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
    }
  })
})
