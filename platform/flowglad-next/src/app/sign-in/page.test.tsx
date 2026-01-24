/**
 * Sign-In Page Tests
 *
 * Tests covering form validation for the sign-in page.
 * The signInSchema is used to validate email and password inputs.
 *
 * NOTE: Full end-to-end testing of the page with all UI components requires
 * integration testing due to complex dependencies (Radix UI, shadcn, etc).
 */
import { describe, it, expect } from 'vitest'
import { signInSchema } from '@/lib/authSchema'

describe('SignIn Page - Form Validation', () => {
  describe('signInSchema validation', () => {
    // ============================================================
    // Valid Input Scenarios
    // ============================================================
    describe('valid input', () => {
      it('should validate correct email and password', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: 'mypassword',
        })
        expect(result.success).toBe(true)
      })

      it('should accept email with subdomain', () => {
        const result = signInSchema.safeParse({
          email: 'user@mail.example.com',
          password: 'password123',
        })
        expect(result.success).toBe(true)
      })

      it('should accept email with plus addressing', () => {
        const result = signInSchema.safeParse({
          email: 'user+tag@example.com',
          password: 'password123',
        })
        expect(result.success).toBe(true)
      })

      it('should accept single character password', () => {
        // Sign-in schema only requires non-empty password (not min length like signup)
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: 'a',
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Email Validation Scenarios
    // ============================================================
    describe('email validation', () => {
      it('should reject empty email', () => {
        const result = signInSchema.safeParse({
          email: '',
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Please enter a valid email'
          )
        }
      })

      it('should reject invalid email format without @', () => {
        const result = signInSchema.safeParse({
          email: 'not-an-email',
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Please enter a valid email'
          )
        }
      })

      it('should reject email without domain', () => {
        const result = signInSchema.safeParse({
          email: 'test@',
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email without local part', () => {
        const result = signInSchema.safeParse({
          email: '@example.com',
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email with spaces', () => {
        const result = signInSchema.safeParse({
          email: 'test @example.com',
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email with multiple @ symbols', () => {
        const result = signInSchema.safeParse({
          email: 'test@@example.com',
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email with invalid TLD', () => {
        const result = signInSchema.safeParse({
          email: 'test@example',
          password: 'mypassword',
        })
        // Note: Zod email validation may or may not require TLD
        // This test documents current behavior
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Password Validation Scenarios
    // ============================================================
    describe('password validation', () => {
      it('should reject empty password', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Please enter your password'
          )
        }
      })

      it('should accept whitespace-only password for sign-in', () => {
        // Sign-in only checks for non-empty, whitespace counts as input
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: '   ',
        })
        expect(result.success).toBe(true)
      })

      it('should accept very long password', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: 'a'.repeat(1000),
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with special characters', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with unicode characters', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: 'пароль密码',
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Missing Field Scenarios
    // ============================================================
    describe('missing fields', () => {
      it('should reject when email is missing', () => {
        const result = signInSchema.safeParse({
          password: 'mypassword',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when password is missing', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when both fields are missing', () => {
        const result = signInSchema.safeParse({})
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Edge Cases
    // ============================================================
    describe('edge cases', () => {
      it('should handle null values gracefully', () => {
        const result = signInSchema.safeParse({
          email: null,
          password: null,
        })
        expect(result.success).toBe(false)
      })

      it('should handle undefined values gracefully', () => {
        const result = signInSchema.safeParse({
          email: undefined,
          password: undefined,
        })
        expect(result.success).toBe(false)
      })

      it('should reject non-string email', () => {
        const result = signInSchema.safeParse({
          email: 123,
          password: 'password',
        })
        expect(result.success).toBe(false)
      })

      it('should reject non-string password', () => {
        const result = signInSchema.safeParse({
          email: 'test@example.com',
          password: 123,
        })
        expect(result.success).toBe(false)
      })
    })
  })
})
