import { describe, expect, it } from 'bun:test'
import { EventNoun, FlowgladEventType } from '@db-core/enums'
import { ValidationError } from '@/errors'
import { validateEventInsertPayload } from './event-inserted'

describe('validateEventInsertPayload', () => {
  it('returns Result.ok with transformed dates when payload is valid', () => {
    const nowIso = new Date().toISOString()
    const nowTimestamp = new Date(nowIso).getTime()
    const validPayload = {
      table: 'events',
      schema: 'public',
      type: 'INSERT',
      record: {
        id: 'evt_123',
        type: FlowgladEventType.PaymentSucceeded,
        organization_id: 'org_123',
        livemode: true,
        payload: { object: EventNoun.Payment, id: 'pay_123' },
        hash: 'abc123',
        metadata: {},
        created_at: nowIso,
        updated_at: nowIso,
        occurred_at: nowIso,
        submitted_at: nowIso,
        processed_at: null,
        created_by_commit: null,
        updated_by_commit: null,
        position: 1,
        object_entity: null,
        object_id: null,
        pricing_model_id: 'pm_123',
      },
    }

    const result = validateEventInsertPayload(validPayload as never)

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      // Verify date strings were transformed and coerced to numeric timestamps
      expect(typeof result.value.record.createdAt).toBe('number')
      expect(typeof result.value.record.updatedAt).toBe('number')
      expect(typeof result.value.record.occurredAt).toBe('number')
      expect(typeof result.value.record.submittedAt).toBe('number')
      // Verify timestamps are close to the expected value (within 1 second)
      expect(result.value.record.createdAt).toBeCloseTo(
        nowTimestamp,
        -3
      )
      expect(result.value.record.processedAt).toBeNull()
      // Verify other fields are preserved and transformed to camelCase
      expect(result.value.record.id).toBe('evt_123')
      expect(result.value.record.type).toBe(
        FlowgladEventType.PaymentSucceeded
      )
      expect(result.value.record.organizationId).toBe('org_123')
    }
  })

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
