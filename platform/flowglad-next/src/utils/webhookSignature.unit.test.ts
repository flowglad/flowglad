import { describe, expect, it } from 'bun:test'
import {
  computeSignature,
  DEFAULT_TOLERANCE_SECONDS,
  generateSignatureHeader,
  generateSigningSecret,
  parseSignatureHeader,
  verifyWebhookSignature,
} from './webhookSignature'

describe('webhookSignature', () => {
  describe('generateSigningSecret', () => {
    it('returns a 64-character hex string', () => {
      const secret = generateSigningSecret()

      expect(secret).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/.test(secret)).toBe(true)
    })

    it('generates unique secrets on each call', () => {
      const secret1 = generateSigningSecret()
      const secret2 = generateSigningSecret()
      const secret3 = generateSigningSecret()

      expect(secret1).not.toBe(secret2)
      expect(secret2).not.toBe(secret3)
      expect(secret1).not.toBe(secret3)
    })
  })

  describe('computeSignature', () => {
    it('generates a valid HMAC-SHA256 signature as hex string', () => {
      const payload = '{"scopeId":"test-scope","eventCount":5}'
      const secret = 'a'.repeat(64) // 32-byte hex string
      const timestamp = 1700000000

      const signature = computeSignature(payload, secret, timestamp)

      // HMAC-SHA256 produces a 64-character hex string (256 bits = 32 bytes = 64 hex chars)
      expect(signature).toHaveLength(64)
      expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true)
    })

    it('produces different signatures for different payloads', () => {
      const secret = generateSigningSecret()
      const timestamp = 1700000000

      const sig1 = computeSignature(
        '{"data":"one"}',
        secret,
        timestamp
      )
      const sig2 = computeSignature(
        '{"data":"two"}',
        secret,
        timestamp
      )

      expect(sig1).not.toBe(sig2)
    })

    it('produces different signatures for different timestamps', () => {
      const payload = '{"data":"test"}'
      const secret = generateSigningSecret()

      const sig1 = computeSignature(payload, secret, 1700000000)
      const sig2 = computeSignature(payload, secret, 1700000001)

      expect(sig1).not.toBe(sig2)
    })

    it('produces different signatures for different secrets', () => {
      const payload = '{"data":"test"}'
      const timestamp = 1700000000

      const sig1 = computeSignature(
        payload,
        generateSigningSecret(),
        timestamp
      )
      const sig2 = computeSignature(
        payload,
        generateSigningSecret(),
        timestamp
      )

      expect(sig1).not.toBe(sig2)
    })

    it('produces consistent signatures for the same inputs', () => {
      const payload = '{"data":"test"}'
      const secret = 'b'.repeat(64)
      const timestamp = 1700000000

      const sig1 = computeSignature(payload, secret, timestamp)
      const sig2 = computeSignature(payload, secret, timestamp)

      expect(sig1).toBe(sig2)
    })
  })

  describe('generateSignatureHeader', () => {
    it('formats header as t=<timestamp>,v1=<signature>', () => {
      const payload = '{"test":"data"}'
      const secret = generateSigningSecret()
      const timestamp = 1700000000

      const header = generateSignatureHeader(
        payload,
        secret,
        timestamp
      )

      expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/)
    })

    it('uses current time when timestamp not provided', () => {
      const payload = '{"test":"data"}'
      const secret = generateSigningSecret()

      const before = Math.floor(Date.now() / 1000)
      const header = generateSignatureHeader(payload, secret)
      const after = Math.floor(Date.now() / 1000)

      const parsed = parseSignatureHeader(header)
      // Verify parsed has expected shape with timestamp in valid range
      expect(parsed).toMatchObject({ signature: expect.any(String) })
      expect(parsed!.timestamp).toBeGreaterThanOrEqual(before)
      expect(parsed!.timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('parseSignatureHeader', () => {
    it('parses valid signature header into timestamp and signature', () => {
      const header = 't=1700000000,v1=' + 'a'.repeat(64)

      const result = parseSignatureHeader(header)

      expect(result).toEqual({
        timestamp: 1700000000,
        signature: 'a'.repeat(64),
      })
    })

    it('handles headers with parts in different order', () => {
      const header = 'v1=' + 'b'.repeat(64) + ',t=1700000001'

      const result = parseSignatureHeader(header)

      expect(result).toEqual({
        timestamp: 1700000001,
        signature: 'b'.repeat(64),
      })
    })

    it('returns null for empty header', () => {
      expect(parseSignatureHeader('')).toBeNull()
    })

    it('returns null for header missing timestamp', () => {
      const header = 'v1=' + 'a'.repeat(64)
      expect(parseSignatureHeader(header)).toBeNull()
    })

    it('returns null for header missing signature', () => {
      const header = 't=1700000000'
      expect(parseSignatureHeader(header)).toBeNull()
    })

    it('returns null for malformed header', () => {
      expect(parseSignatureHeader('invalid')).toBeNull()
      expect(parseSignatureHeader('t=,v1=')).toBeNull()
      expect(parseSignatureHeader('t=abc,v1=def')).toBeNull()
    })
  })

  describe('verifyWebhookSignature', () => {
    it('returns true for valid signature within timestamp tolerance', () => {
      const payload = '{"scopeId":"test-scope","eventCount":3}'
      const secret = generateSigningSecret()
      const timestamp = Math.floor(Date.now() / 1000) // Current time

      const header = generateSignatureHeader(
        payload,
        secret,
        timestamp
      )

      const result = verifyWebhookSignature(payload, header, secret)

      expect(result).toBe(true)
    })

    it('returns false for tampered payload', () => {
      const originalPayload =
        '{"scopeId":"test-scope","eventCount":3}'
      const tamperedPayload =
        '{"scopeId":"test-scope","eventCount":999}'
      const secret = generateSigningSecret()
      const timestamp = Math.floor(Date.now() / 1000)

      const header = generateSignatureHeader(
        originalPayload,
        secret,
        timestamp
      )

      const result = verifyWebhookSignature(
        tamperedPayload,
        header,
        secret
      )

      expect(result).toBe(false)
    })

    it('returns false for wrong secret', () => {
      const payload = '{"scopeId":"test-scope"}'
      const correctSecret = generateSigningSecret()
      const wrongSecret = generateSigningSecret()
      const timestamp = Math.floor(Date.now() / 1000)

      const header = generateSignatureHeader(
        payload,
        correctSecret,
        timestamp
      )

      const result = verifyWebhookSignature(
        payload,
        header,
        wrongSecret
      )

      expect(result).toBe(false)
    })

    it('returns false for expired timestamp (older than tolerance)', () => {
      const payload = '{"scopeId":"test-scope"}'
      const secret = generateSigningSecret()
      // Timestamp from 6 minutes ago (beyond default 5-minute tolerance)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 360

      const header = generateSignatureHeader(
        payload,
        secret,
        oldTimestamp
      )

      const result = verifyWebhookSignature(payload, header, secret)

      expect(result).toBe(false)
    })

    it('returns false for future timestamp beyond tolerance', () => {
      const payload = '{"scopeId":"test-scope"}'
      const secret = generateSigningSecret()
      // Timestamp 6 minutes in the future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 360

      const header = generateSignatureHeader(
        payload,
        secret,
        futureTimestamp
      )

      const result = verifyWebhookSignature(payload, header, secret)

      expect(result).toBe(false)
    })

    it('returns true for timestamp at edge of tolerance window', () => {
      const payload = '{"scopeId":"test-scope"}'
      const secret = generateSigningSecret()
      // Timestamp just within 5-minute tolerance (4 minutes 59 seconds ago)
      const edgeTimestamp =
        Math.floor(Date.now() / 1000) -
        (DEFAULT_TOLERANCE_SECONDS - 1)

      const header = generateSignatureHeader(
        payload,
        secret,
        edgeTimestamp
      )

      const result = verifyWebhookSignature(payload, header, secret)

      expect(result).toBe(true)
    })

    it('accepts custom tolerance value', () => {
      const payload = '{"scopeId":"test-scope"}'
      const secret = generateSigningSecret()
      // Timestamp 2 minutes ago
      const timestamp = Math.floor(Date.now() / 1000) - 120

      const header = generateSignatureHeader(
        payload,
        secret,
        timestamp
      )

      // Should fail with 1-minute tolerance
      expect(
        verifyWebhookSignature(payload, header, secret, 60)
      ).toBe(false)

      // Should pass with 3-minute tolerance
      expect(
        verifyWebhookSignature(payload, header, secret, 180)
      ).toBe(true)
    })

    it('returns false for invalid signature header format', () => {
      const payload = '{"scopeId":"test-scope"}'
      const secret = generateSigningSecret()

      expect(verifyWebhookSignature(payload, '', secret)).toBe(false)
      expect(verifyWebhookSignature(payload, 'invalid', secret)).toBe(
        false
      )
      expect(
        verifyWebhookSignature(payload, 't=abc,v1=def', secret)
      ).toBe(false)
    })

    it('rejects signatures with different lengths (timing attack protection)', () => {
      const payload = '{"scopeId":"test-scope"}'
      const secret = generateSigningSecret()
      const timestamp = Math.floor(Date.now() / 1000)

      // Create a header with a truncated signature
      const shortSignature = 'a'.repeat(32) // Half the expected length
      const header = `t=${timestamp},v1=${shortSignature}`

      const result = verifyWebhookSignature(payload, header, secret)

      expect(result).toBe(false)
    })
  })
})
