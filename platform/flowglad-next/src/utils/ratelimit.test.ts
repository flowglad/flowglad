import { describe, expect, it } from 'vitest'
import {
  createFingerprint,
  RateLimitExceededError,
  RateLimiters,
} from './ratelimit'

describe('ratelimit utilities', () => {
  describe('createFingerprint', () => {
    it('returns a 32-character hex string from IP and user agent', () => {
      const fingerprint = createFingerprint(
        '192.168.1.1',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      )

      expect(fingerprint).toHaveLength(32)
      expect(fingerprint).toMatch(/^[a-f0-9]+$/)
    })

    it('produces different fingerprints for different IPs with same user agent', () => {
      const userAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

      const fp1 = createFingerprint('192.168.1.1', userAgent)
      const fp2 = createFingerprint('192.168.1.2', userAgent)

      expect(fp1).not.toEqual(fp2)
    })

    it('produces different fingerprints for same IP with different user agents', () => {
      const ip = '192.168.1.1'

      const fp1 = createFingerprint(ip, 'Mozilla/5.0 (Macintosh)')
      const fp2 = createFingerprint(ip, 'Mozilla/5.0 (Windows)')

      expect(fp1).not.toEqual(fp2)
    })

    it('produces same fingerprint for same IP and user agent', () => {
      const ip = '192.168.1.1'
      const userAgent =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

      const fp1 = createFingerprint(ip, userAgent)
      const fp2 = createFingerprint(ip, userAgent)

      expect(fp1).toEqual(fp2)
    })
  })

  describe('RateLimitExceededError', () => {
    it('includes identifier, resetAt, limit, and remaining in the error', () => {
      const resetAt = new Date('2024-01-01T00:00:00Z')
      const error = new RateLimitExceededError(
        'test-identifier',
        resetAt,
        100,
        0
      )

      expect(error.name).toBe('RateLimitExceededError')
      expect(error.message).toBe(
        'Rate limit exceeded for test-identifier'
      )
      expect(error.identifier).toBe('test-identifier')
      expect(error.resetAt).toEqual(resetAt)
      expect(error.limit).toBe(100)
      expect(error.remaining).toBe(0)
    })

    it('extends Error class', () => {
      const error = new RateLimitExceededError(
        'test',
        new Date(),
        10,
        0
      )

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(RateLimitExceededError)
    })
  })

  describe('RateLimiters', () => {
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
})
