import { describe, expect, it } from 'bun:test'
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
    it('should show only the first character followed by mask when local part is single character', () => {
      expect(maskEmail('a@example.com')).toBe('a***@example.com')
    })

    it('should mask second character when local part has two characters', () => {
      expect(maskEmail('ab@example.com')).toBe('a***@example.com')
    })

    it('should preserve first and last character when local part has three characters', () => {
      expect(maskEmail('abc@example.com')).toBe('a***c@example.com')
    })
  })

  describe('various domain formats', () => {
    it('should preserve subdomain in domain', () => {
      expect(maskEmail('user@mail.example.com')).toBe(
        'u***r@mail.example.com'
      )
    })

    it('should preserve short TLD while masking local part', () => {
      expect(maskEmail('user@example.io')).toBe('u***r@example.io')
    })

    it('should preserve long TLD while masking local part', () => {
      expect(maskEmail('user@example.company')).toBe(
        'u***r@example.company'
      )
    })
  })

  describe('special characters in local part', () => {
    it('should mask middle characters including dots in local part', () => {
      expect(maskEmail('john.doe@example.com')).toBe(
        'jo***e@example.com'
      )
    })

    it('should mask middle characters including plus signs in local part', () => {
      expect(maskEmail('user+tag@example.com')).toBe(
        'us***g@example.com'
      )
    })

    it('should mask middle characters including underscores in local part', () => {
      expect(maskEmail('john_doe@example.com')).toBe(
        'jo***e@example.com'
      )
    })
  })
})
