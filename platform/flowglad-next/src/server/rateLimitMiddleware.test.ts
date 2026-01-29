import { describe, expect, it } from 'vitest'
import { createFingerprint } from '@/utils/ratelimit'
import { RateLimiters } from './rateLimitMiddleware'

/**
 * Tests for the rate limit middleware utilities.
 *
 * Note: Integration tests for the actual middleware behavior would require
 * Redis and the full tRPC setup. These tests focus on the exported utilities.
 */
describe('rateLimitMiddleware', () => {
  describe('RateLimiters (re-export)', () => {
    it('ai() returns a sliding window rate limiter configuration', () => {
      const limiter = RateLimiters.ai()
      // The limiter is an array tuple from Ratelimit.slidingWindow
      expect(Array.isArray(limiter)).toBe(true)
    })

    it('standard() returns a sliding window rate limiter configuration', () => {
      const limiter = RateLimiters.standard()
      expect(Array.isArray(limiter)).toBe(true)
    })

    it('strict() returns a sliding window rate limiter configuration', () => {
      const limiter = RateLimiters.strict()
      expect(Array.isArray(limiter)).toBe(true)
    })
  })

  describe('createFingerprint (used by rateLimitByFingerprint)', () => {
    it('produces unique fingerprints for different IP + user agent combinations', () => {
      const fp1 = createFingerprint(
        '192.168.1.1',
        'Mozilla/5.0 (Macintosh)'
      )
      const fp2 = createFingerprint(
        '192.168.1.2',
        'Mozilla/5.0 (Macintosh)'
      )
      const fp3 = createFingerprint(
        '192.168.1.1',
        'Mozilla/5.0 (Windows)'
      )

      // Different IPs should produce different fingerprints
      expect(fp1).not.toEqual(fp2)
      // Different user agents should produce different fingerprints
      expect(fp1).not.toEqual(fp3)
      // Same inputs should produce same fingerprint
      expect(
        createFingerprint('192.168.1.1', 'Mozilla/5.0 (Macintosh)')
      ).toEqual(fp1)
    })

    it('handles "unknown" values gracefully', () => {
      // This is what rateLimitByFingerprint does when ctx is missing fields
      const fp = createFingerprint('unknown', 'unknown')
      expect(fp).toHaveLength(32)
      expect(fp).toMatch(/^[a-f0-9]+$/)
    })
  })
})
