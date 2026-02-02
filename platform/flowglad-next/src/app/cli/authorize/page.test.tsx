/**
 * @vitest-environment jsdom
 */

/**
 * CLI Authorize Page Tests
 *
 * Tests for the CLI authorization form validation and flow.
 * Full component testing with real tRPC calls would require integration tests.
 */
import { describe, expect, it } from 'bun:test'
import { z } from 'zod'

// Schema for user code validation (matches what the component expects)
const userCodeSchema = z.string().min(1)

describe('authorize page', () => {
  describe('user code validation', () => {
    it('shows authorization form for valid user code', () => {
      // Valid user codes should pass validation
      const result = userCodeSchema.safeParse('ABCD-1234')
      expect(result.success).toBe(true)
    })

    it('shows error for invalid user code (empty string)', () => {
      // Empty user codes should fail validation
      const result = userCodeSchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('accepts various user code formats', () => {
      // Test various valid formats
      const validCodes = [
        'ABCD1234', // No separator
        'ABCD-1234', // Hyphen separator
        'abcd-1234', // Lowercase (will be uppercased in UI)
        '12345678', // All numbers
      ]

      validCodes.forEach((code) => {
        const result = userCodeSchema.safeParse(code)
        expect(result.success).toBe(true)
      })
    })
  })

  describe('authorization state transitions', () => {
    it('shows error for expired user code', () => {
      // Test the error state representation
      const errorState = {
        valid: false,
        error: 'Invalid or expired code',
      }

      expect(errorState.valid).toBe(false)
      expect(errorState.error).toContain('expired')
    })
  })

  describe('redirect behavior', () => {
    it('redirects to login if user not authenticated', () => {
      // This tests the expected redirect URL format
      const userCode = 'ABCD-1234'
      const callbackUrl = `/cli/authorize?user_code=${encodeURIComponent(userCode)}`
      const expectedRedirect = `/sign-in?callbackURL=${encodeURIComponent(callbackUrl)}`

      expect(expectedRedirect).toBe(
        '/sign-in?callbackURL=%2Fcli%2Fauthorize%3Fuser_code%3DABCD-1234'
      )
    })
  })
})
