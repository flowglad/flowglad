import { describe, expect, it } from 'bun:test'
import { EventNoun, FlowgladEventType } from '@/types'
import {
  buildScopeId,
  createSyncEventsAvailableEvent,
  createSyncEventsAvailablePayload,
  parseScopeId,
} from './syncWebhook'

describe('syncWebhook', () => {
  describe('buildScopeId', () => {
    it('returns correct scope ID for livemode true', () => {
      const scopeId = buildScopeId('org_123', true)
      expect(scopeId).toBe('org_123:live')
    })

    it('returns correct scope ID for livemode false', () => {
      const scopeId = buildScopeId('org_456', false)
      expect(scopeId).toBe('org_456:test')
    })

    it('throws error for empty organizationId', () => {
      expect(() => buildScopeId('', true)).toThrow(
        'organizationId cannot be empty'
      )
    })

    it('throws error for whitespace-only organizationId', () => {
      expect(() => buildScopeId('   ', false)).toThrow(
        'organizationId cannot be empty'
      )
    })

    it('trims whitespace from organizationId', () => {
      const scopeId = buildScopeId('  org_123  ', true)
      expect(scopeId).toBe('org_123:live')
    })
  })

  describe('parseScopeId', () => {
    it('parses valid live scope ID', () => {
      const result = parseScopeId('org_123:live')
      expect(result).toEqual({
        organizationId: 'org_123',
        livemode: true,
      })
    })

    it('parses valid test scope ID', () => {
      const result = parseScopeId('org_456:test')
      expect(result).toEqual({
        organizationId: 'org_456',
        livemode: false,
      })
    })

    it('returns null for invalid scope ID without colon', () => {
      const result = parseScopeId('org_123_live')
      expect(result).toBeNull()
    })

    it('returns null for scope ID with invalid mode', () => {
      const result = parseScopeId('org_123:staging')
      expect(result).toBeNull()
    })

    it('returns null for scope ID with too many colons', () => {
      const result = parseScopeId('org_123:live:extra')
      expect(result).toBeNull()
    })

    it('returns null for scope ID with empty organizationId', () => {
      const result = parseScopeId(':live')
      expect(result).toBeNull()
    })

    it('returns null for scope ID with whitespace-only organizationId', () => {
      const result = parseScopeId('   :test')
      expect(result).toBeNull()
    })

    it('trims whitespace from organizationId in parsed result', () => {
      const result = parseScopeId('  org_123  :live')
      expect(result).toEqual({
        organizationId: 'org_123',
        livemode: true,
      })
    })
  })

  describe('createSyncEventsAvailablePayload', () => {
    it('creates payload with correct structure', () => {
      const payload = createSyncEventsAvailablePayload({
        scopeId: 'org_123:live',
        latestSequence: '1700000000000-0',
        eventCount: 5,
      })

      expect(payload.id).toBe('org_123:live')
      expect(payload.object).toBe(EventNoun.SyncStream)
      expect(payload.scopeId).toBe('org_123:live')
      expect(payload.latestSequence).toBe('1700000000000-0')
      expect(payload.eventCount).toBe(5)
    })
  })

  describe('createSyncEventsAvailableEvent', () => {
    it('creates event with correct type and payload', () => {
      const event = createSyncEventsAvailableEvent({
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: true,
        latestSequence: '1700000000000-0',
        eventCount: 5,
      })

      expect(event.type).toBe(FlowgladEventType.SyncEventsAvailable)
      expect(event.organizationId).toBe('org_123')
      expect(event.pricingModelId).toBe('pm_456')
      expect(event.livemode).toBe(true)
      expect(event.payload.scopeId).toBe('org_123:live')
      expect(event.payload.latestSequence).toBe('1700000000000-0')
      expect(event.payload.eventCount).toBe(5)
      expect(event.payload.object).toBe(EventNoun.SyncStream)
    })

    it('generates unique hash for different sequences', () => {
      const event1 = createSyncEventsAvailableEvent({
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: true,
        latestSequence: '1700000000000-0',
        eventCount: 5,
      })

      const event2 = createSyncEventsAvailableEvent({
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: true,
        latestSequence: '1700000000000-1',
        eventCount: 6,
      })

      expect(event1.hash).not.toBe(event2.hash)
    })

    it('generates same hash for same scope and sequence', () => {
      const event1 = createSyncEventsAvailableEvent({
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: true,
        latestSequence: '1700000000000-0',
        eventCount: 5,
      })

      const event2 = createSyncEventsAvailableEvent({
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: true,
        latestSequence: '1700000000000-0',
        eventCount: 10, // Different count, same sequence
      })

      expect(event1.hash).toBe(event2.hash)
    })
  })
})
