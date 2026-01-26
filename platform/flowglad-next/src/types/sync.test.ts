import { describe, expect, it } from 'bun:test'
import { ZodError } from 'zod'
import {
  isSyncNamespace,
  SYNC_NAMESPACES,
  type SyncEvent,
  type SyncEventInsert,
  type SyncNamespace,
  syncEventInsertSchema,
  syncEventSchema,
} from './sync'

describe('sync event types', () => {
  describe('syncEventSchema', () => {
    it('validates a well-formed event with all required fields and returns typed object', () => {
      const validEvent: SyncEvent = {
        id: 'evt_123',
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'update',
        data: { customerId: 'cus_456', status: 'active' },
        sequence: '1706745600000-0',
        timestamp: '2024-02-01T00:00:00.000Z',
        livemode: true,
      }

      const result = syncEventSchema.safeParse(validEvent)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('evt_123')
        expect(result.data.namespace).toBe('customerSubscriptions')
        expect(result.data.entityId).toBe('cus_456')
        expect(result.data.scopeId).toBe('org_789')
        expect(result.data.eventType).toBe('update')
        expect(result.data.data).toEqual({
          customerId: 'cus_456',
          status: 'active',
        })
        expect(result.data.sequence).toBe('1706745600000-0')
        expect(result.data.timestamp).toBe('2024-02-01T00:00:00.000Z')
        expect(result.data.livemode).toBe(true)
      }
    })

    it('validates an event with null data (for delete events)', () => {
      const deleteEvent: SyncEvent = {
        id: 'evt_delete_123',
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'delete',
        data: null,
        sequence: '1706745600001-0',
        timestamp: '2024-02-01T00:00:01.000Z',
        livemode: false,
      }

      const result = syncEventSchema.safeParse(deleteEvent)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.eventType).toBe('delete')
        expect(result.data.data).toBeNull()
        expect(result.data.livemode).toBe(false)
      }
    })

    it('rejects event with missing namespace field', () => {
      const eventMissingNamespace = {
        id: 'evt_123',
        // namespace is missing
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'update',
        data: { status: 'active' },
        sequence: '1706745600000-0',
        timestamp: '2024-02-01T00:00:00.000Z',
        livemode: true,
      }

      const result = syncEventSchema.safeParse(eventMissingNamespace)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError)
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('namespace')
          )
        ).toBe(true)
      }
    })

    it('rejects event with missing entityId field', () => {
      const eventMissingEntityId = {
        id: 'evt_123',
        namespace: 'customerSubscriptions',
        // entityId is missing
        scopeId: 'org_789',
        eventType: 'update',
        data: { status: 'active' },
        sequence: '1706745600000-0',
        timestamp: '2024-02-01T00:00:00.000Z',
        livemode: true,
      }

      const result = syncEventSchema.safeParse(eventMissingEntityId)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError)
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('entityId')
          )
        ).toBe(true)
      }
    })

    it('rejects invalid eventType values (only "update" and "delete" are allowed)', () => {
      const eventWithInvalidType = {
        id: 'evt_123',
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'create', // invalid - only 'update' | 'delete' allowed
        data: { status: 'active' },
        sequence: '1706745600000-0',
        timestamp: '2024-02-01T00:00:00.000Z',
        livemode: true,
      }

      const result = syncEventSchema.safeParse(eventWithInvalidType)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError)
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('eventType')
          )
        ).toBe(true)
      }
    })

    it('rejects event with empty string for required string fields', () => {
      const eventWithEmptyId = {
        id: '', // empty string should fail min(1) validation
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'update',
        data: { status: 'active' },
        sequence: '1706745600000-0',
        timestamp: '2024-02-01T00:00:00.000Z',
        livemode: true,
      }

      const result = syncEventSchema.safeParse(eventWithEmptyId)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError)
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('id')
          )
        ).toBe(true)
      }
    })

    it('rejects event with invalid timestamp format', () => {
      const eventWithInvalidTimestamp = {
        id: 'evt_123',
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'update',
        data: { status: 'active' },
        sequence: '1706745600000-0',
        timestamp: 'not-a-valid-timestamp',
        livemode: true,
      }

      const result = syncEventSchema.safeParse(
        eventWithInvalidTimestamp
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError)
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('timestamp')
          )
        ).toBe(true)
      }
    })
  })

  describe('syncEventInsertSchema', () => {
    it('validates a well-formed insert object for an update event', () => {
      const validInsert: SyncEventInsert = {
        namespace: 'customerSubscriptions',
        entityId: 'cus_456',
        scopeId: 'org_789',
        eventType: 'update',
        data: { customerId: 'cus_456', status: 'active' },
        livemode: true,
      }

      const result = syncEventInsertSchema.safeParse(validInsert)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.namespace).toBe('customerSubscriptions')
        expect(result.data.entityId).toBe('cus_456')
        expect(result.data.eventType).toBe('update')
        expect(result.data.livemode).toBe(true)
      }
    })

    it('validates a well-formed insert object for a delete event with null data', () => {
      const deleteInsert: SyncEventInsert = {
        namespace: 'invoices',
        entityId: 'inv_789',
        scopeId: 'org_123',
        eventType: 'delete',
        data: null,
        livemode: false,
      }

      const result = syncEventInsertSchema.safeParse(deleteInsert)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.eventType).toBe('delete')
        expect(result.data.data).toBeNull()
      }
    })

    it('rejects insert with missing required fields', () => {
      const invalidInsert = {
        namespace: 'customerSubscriptions',
        // entityId is missing
        scopeId: 'org_789',
        eventType: 'update',
        data: { status: 'active' },
        livemode: true,
      }

      const result = syncEventInsertSchema.safeParse(invalidInsert)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ZodError)
        expect(
          result.error.issues.some((issue) =>
            issue.path.includes('entityId')
          )
        ).toBe(true)
      }
    })
  })

  describe('isSyncNamespace', () => {
    it('returns true for all valid SyncNamespace values', () => {
      const validNamespaces: SyncNamespace[] = [
        'customerSubscriptions',
        'subscriptionItems',
        'subscriptionItemFeatures',
        'meterBalances',
        'paymentMethods',
        'purchases',
        'invoices',
      ]

      for (const namespace of validNamespaces) {
        expect(isSyncNamespace(namespace)).toBe(true)
      }

      // Verify we tested all namespaces
      expect(validNamespaces.length).toBe(SYNC_NAMESPACES.length)
    })

    it('returns false for invalid namespace strings', () => {
      const invalidNamespaces = [
        'invalidNamespace',
        'customer_subscriptions', // wrong format (snake_case)
        'CustomerSubscriptions', // wrong case (PascalCase)
        'CUSTOMER_SUBSCRIPTIONS', // wrong case (SCREAMING_SNAKE_CASE)
        'random',
        'users',
        'orders',
      ]

      for (const namespace of invalidNamespaces) {
        expect(isSyncNamespace(namespace)).toBe(false)
      }
    })

    it('returns false for empty string', () => {
      expect(isSyncNamespace('')).toBe(false)
    })

    it('returns false for non-string values', () => {
      expect(isSyncNamespace(null)).toBe(false)
      expect(isSyncNamespace(undefined)).toBe(false)
      expect(isSyncNamespace(123)).toBe(false)
      expect(isSyncNamespace({})).toBe(false)
      expect(isSyncNamespace([])).toBe(false)
      expect(isSyncNamespace(true)).toBe(false)
    })
  })

  describe('SYNC_NAMESPACES constant', () => {
    it('contains all expected namespace values', () => {
      expect(SYNC_NAMESPACES).toContain('customerSubscriptions')
      expect(SYNC_NAMESPACES).toContain('subscriptionItems')
      expect(SYNC_NAMESPACES).toContain('subscriptionItemFeatures')
      expect(SYNC_NAMESPACES).toContain('meterBalances')
      expect(SYNC_NAMESPACES).toContain('paymentMethods')
      expect(SYNC_NAMESPACES).toContain('purchases')
      expect(SYNC_NAMESPACES).toContain('invoices')
      expect(SYNC_NAMESPACES.length).toBe(7)
    })
  })
})
