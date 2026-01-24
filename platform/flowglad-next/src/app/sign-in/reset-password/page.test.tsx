/**
 * Reset Password Page Tests
 *
 * Tests covering form validation for the reset password page.
 * The newPasswordSchema validates password and passwordConfirmation.
 *
 * NOTE: Full end-to-end testing of the page with all UI components requires
 * integration testing due to complex dependencies (Radix UI, shadcn, etc).
 *
 * The reset password page has three states:
 * 1. Invalid/missing token state - shows error message
 * 2. Form state - shows password reset form
 * 3. Success state - shows success message and redirects
 */
import { describe, it, expect } from 'vitest'
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@/lib/authSchema'

describe('Reset Password Page - Form Validation', () => {
  const validData = {
    password: 'newpassword123',
    passwordConfirmation: 'newpassword123',
  }

  describe('newPasswordSchema validation', () => {
    // ============================================================
    // Valid Input Scenarios
    // ============================================================
    describe('valid input', () => {
      it('should validate correct matching passwords', () => {
        const result = newPasswordSchema.safeParse(validData)
        expect(result.success).toBe(true)
      })

      it('should validate password at minimum length', () => {
        const minPassword = 'a'.repeat(PASSWORD_MIN_LENGTH)
        const result = newPasswordSchema.safeParse({
          password: minPassword,
          passwordConfirmation: minPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password just over minimum length', () => {
        const password = 'a'.repeat(PASSWORD_MIN_LENGTH + 1)
        const result = newPasswordSchema.safeParse({
          password: password,
          passwordConfirmation: password,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with special characters', () => {
        const specialPassword = '!@#$%^&*()_+'.padEnd(PASSWORD_MIN_LENGTH, '!')
        const result = newPasswordSchema.safeParse({
          password: specialPassword,
          passwordConfirmation: specialPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with numbers only', () => {
        const numericPassword = '12345678'
        const result = newPasswordSchema.safeParse({
          password: numericPassword,
          passwordConfirmation: numericPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept very long password', () => {
        const longPassword = 'a'.repeat(500)
        const result = newPasswordSchema.safeParse({
          password: longPassword,
          passwordConfirmation: longPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with unicode characters', () => {
        const unicodePassword = 'пароль密码абв'
        const result = newPasswordSchema.safeParse({
          password: unicodePassword,
          passwordConfirmation: unicodePassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with mixed case', () => {
        const mixedPassword = 'AbCdEfGh'
        const result = newPasswordSchema.safeParse({
          password: mixedPassword,
          passwordConfirmation: mixedPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with leading spaces if matched', () => {
        const spacedPassword = '  password123'
        const result = newPasswordSchema.safeParse({
          password: spacedPassword,
          passwordConfirmation: spacedPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with trailing spaces if matched', () => {
        const spacedPassword = 'password123  '
        const result = newPasswordSchema.safeParse({
          password: spacedPassword,
          passwordConfirmation: spacedPassword,
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Password Length Validation Scenarios
    // ============================================================
    describe('password length validation', () => {
      it('should reject password shorter than minimum length', () => {
        const shortPassword = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
        const result = newPasswordSchema.safeParse({
          password: shortPassword,
          passwordConfirmation: shortPassword,
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
          )
        }
      })

      it('should reject empty password', () => {
        const result = newPasswordSchema.safeParse({
          password: '',
          passwordConfirmation: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject single character password', () => {
        const result = newPasswordSchema.safeParse({
          password: 'a',
          passwordConfirmation: 'a',
        })
        expect(result.success).toBe(false)
      })

      it('should reject password with length 7 (one less than minimum)', () => {
        const result = newPasswordSchema.safeParse({
          password: 'abcdefg',
          passwordConfirmation: 'abcdefg',
        })
        expect(result.success).toBe(false)
      })

      it('should verify PASSWORD_MIN_LENGTH constant is 8', () => {
        expect(PASSWORD_MIN_LENGTH).toBe(8)
      })
    })

    // ============================================================
    // Password Confirmation Mismatch Scenarios
    // ============================================================
    describe('password confirmation mismatch', () => {
      it('should reject mismatched passwords', () => {
        const result = newPasswordSchema.safeParse({
          password: 'password123',
          passwordConfirmation: 'differentpassword',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          const mismatchError = result.error.issues.find(
            (issue) => issue.path.includes('passwordConfirmation')
          )
          expect(mismatchError?.message).toBe('Passwords do not match')
        }
      })

      it('should reject when password is valid but confirmation is empty', () => {
        const result = newPasswordSchema.safeParse({
          password: 'validpassword123',
          passwordConfirmation: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when confirmation differs by case', () => {
        const result = newPasswordSchema.safeParse({
          password: 'Password123',
          passwordConfirmation: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when confirmation has extra character', () => {
        const result = newPasswordSchema.safeParse({
          password: 'password123',
          passwordConfirmation: 'password1234',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when confirmation is missing a character', () => {
        const result = newPasswordSchema.safeParse({
          password: 'password123',
          passwordConfirmation: 'password12',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when password has trailing space and confirmation does not', () => {
        const result = newPasswordSchema.safeParse({
          password: 'password123 ',
          passwordConfirmation: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when password has leading space and confirmation does not', () => {
        const result = newPasswordSchema.safeParse({
          password: ' password123',
          passwordConfirmation: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject reversed passwords', () => {
        const result = newPasswordSchema.safeParse({
          password: 'password123',
          passwordConfirmation: '321drowssap',
        })
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Missing Fields Scenarios
    // ============================================================
    describe('missing fields', () => {
      it('should reject when password is missing', () => {
        const result = newPasswordSchema.safeParse({
          passwordConfirmation: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when passwordConfirmation is missing', () => {
        const result = newPasswordSchema.safeParse({
          password: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject empty object', () => {
        const result = newPasswordSchema.safeParse({})
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Edge Cases
    // ============================================================
    describe('edge cases', () => {
      it('should handle null values gracefully', () => {
        const result = newPasswordSchema.safeParse({
          password: null,
          passwordConfirmation: null,
        })
        expect(result.success).toBe(false)
      })

      it('should handle undefined values gracefully', () => {
        const result = newPasswordSchema.safeParse({
          password: undefined,
          passwordConfirmation: undefined,
        })
        expect(result.success).toBe(false)
      })

      it('should reject non-string password', () => {
        const result = newPasswordSchema.safeParse({
          password: 12345678,
          passwordConfirmation: 12345678,
        })
        expect(result.success).toBe(false)
      })

      it('should reject array input', () => {
        const result = newPasswordSchema.safeParse({
          password: ['p', 'a', 's', 's', 'w', 'o', 'r', 'd'],
          passwordConfirmation: ['p', 'a', 's', 's', 'w', 'o', 'r', 'd'],
        })
        expect(result.success).toBe(false)
      })

      it('should reject object input', () => {
        const result = newPasswordSchema.safeParse({
          password: { value: 'password123' },
          passwordConfirmation: { value: 'password123' },
        })
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Common Password Patterns
    // ============================================================
    describe('common password patterns', () => {
      it('should accept alphanumeric password', () => {
        const result = newPasswordSchema.safeParse({
          password: 'abc12345',
          passwordConfirmation: 'abc12345',
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with symbols', () => {
        const result = newPasswordSchema.safeParse({
          password: 'P@ssw0rd!',
          passwordConfirmation: 'P@ssw0rd!',
        })
        expect(result.success).toBe(true)
      })

      it('should accept passphrase style password', () => {
        const passphrase = 'correct horse battery staple'
        const result = newPasswordSchema.safeParse({
          password: passphrase,
          passwordConfirmation: passphrase,
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Multiple Validation Errors
    // ============================================================
    describe('multiple validation errors', () => {
      it('should report password too short even when confirmation mismatches', () => {
        const result = newPasswordSchema.safeParse({
          password: 'short',
          passwordConfirmation: 'different',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          // Should have at least password length error
          const lengthError = result.error.issues.find(
            (issue) =>
              issue.message ===
              `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
          )
        expect(lengthError?.message).toBe(
            `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
          )
        }
      })
    })
  })
})
