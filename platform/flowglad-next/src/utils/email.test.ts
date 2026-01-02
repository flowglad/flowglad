import { describe, expect, it } from 'vitest'
import { maskEmail } from './email'

describe('maskEmail', () => {
  describe('standard email addresses', () => {
    it('should mask a typical email address', () => {
      expect(maskEmail('user@example.com')).toBe('u***r@example.com')
    })

    it('should mask a longer local part', () => {
      expect(maskEmail('johndoe@example.com')).toBe(
        'jo***e@example.com'
      )
    })

    it('should mask email with numbers', () => {
      expect(maskEmail('user123@example.com')).toBe(
        'us***3@example.com'
      )
    })
  })

  describe('short local parts (edge cases)', () => {
    it('should handle single character local part', () => {
      expect(maskEmail('a@example.com')).toBe('a***@example.com')
    })

    it('should handle two character local part', () => {
      expect(maskEmail('ab@example.com')).toBe('a***@example.com')
    })

    it('should handle three character local part', () => {
      expect(maskEmail('abc@example.com')).toBe('a***c@example.com')
    })
  })

  describe('various domain formats', () => {
    it('should preserve subdomain in domain', () => {
      expect(maskEmail('user@mail.example.com')).toBe(
        'u***r@mail.example.com'
      )
    })

    it('should handle short TLD', () => {
      expect(maskEmail('user@example.io')).toBe('u***r@example.io')
    })

    it('should handle long TLD', () => {
      expect(maskEmail('user@example.company')).toBe(
        'u***r@example.company'
      )
    })
  })

  describe('special characters in local part', () => {
    it('should handle dots in local part', () => {
      expect(maskEmail('john.doe@example.com')).toBe(
        'jo***e@example.com'
      )
    })

    it('should handle plus sign in local part', () => {
      expect(maskEmail('user+tag@example.com')).toBe(
        'us***g@example.com'
      )
    })

    it('should handle underscores in local part', () => {
      expect(maskEmail('john_doe@example.com')).toBe(
        'jo***e@example.com'
      )
    })
  })
})
