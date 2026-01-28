import { describe, expect, it } from 'bun:test'
import { EventNoun, FlowgladEventType } from '@/types'
import {
  buildScopeId,
  createSyncEventsAvailableEvent,
  createSyncEventsAvailablePayload,
  parseScopeId,
  validateWebhookUrl,
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

  describe('validateWebhookUrl', () => {
    describe('in production mode', () => {
      it('accepts valid HTTPS URLs', () => {
        const result = validateWebhookUrl(
          'https://example.com/webhook',
          true
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('rejects HTTP URLs', () => {
        const result = validateWebhookUrl(
          'http://example.com/webhook',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe(
          'Webhook URL must use HTTPS in production'
        )
      })

      it('rejects localhost URLs', () => {
        const result = validateWebhookUrl(
          'https://localhost:3000/webhook',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe(
          'Localhost URLs are not allowed in production'
        )
      })

      it('rejects 127.0.0.1 URLs', () => {
        const result = validateWebhookUrl(
          'https://127.0.0.1:3000/webhook',
          true
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe(
          'Localhost URLs are not allowed in production'
        )
      })
    })

    describe('in development mode', () => {
      it('accepts HTTP localhost URLs', () => {
        const result = validateWebhookUrl(
          'http://localhost:3000/webhook',
          false
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('accepts HTTP 127.0.0.1 URLs', () => {
        const result = validateWebhookUrl(
          'http://127.0.0.1:3000/webhook',
          false
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('accepts HTTPS URLs', () => {
        const result = validateWebhookUrl(
          'https://example.com/webhook',
          false
        )
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })

      it('rejects HTTP URLs for non-localhost hosts', () => {
        const result = validateWebhookUrl(
          'http://example.com/webhook',
          false
        )
        expect(result.valid).toBe(false)
        expect(result.error).toBe('Non-localhost URLs must use HTTPS')
      })
    })

    it('rejects invalid URL formats', () => {
      const result = validateWebhookUrl('not-a-url', false)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid URL format')
    })

    it('rejects empty string', () => {
      const result = validateWebhookUrl('', false)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid URL format')
    })

    it('rejects FTP URLs in development', () => {
      const result = validateWebhookUrl(
        'ftp://localhost/webhook',
        false
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Webhook URL must use HTTP or HTTPS protocol'
      )
    })

    it('rejects FTP URLs in production', () => {
      const result = validateWebhookUrl(
        'ftp://example.com/webhook',
        true
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Webhook URL must use HTTP or HTTPS protocol'
      )
    })

    it('rejects file:// URLs', () => {
      const result = validateWebhookUrl('file:///etc/passwd', false)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Webhook URL must use HTTP or HTTPS protocol'
      )
    })

    it('rejects data:// URLs', () => {
      const result = validateWebhookUrl(
        'data:text/html,<script>alert(1)</script>',
        false
      )
      expect(result.valid).toBe(false)
      expect(result.error).toBe(
        'Webhook URL must use HTTP or HTTPS protocol'
      )
    })
  })
})
