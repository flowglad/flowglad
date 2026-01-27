/**
 * Sign-Up Page Tests
 *
 * Tests covering form validation for the sign-up page.
 * The signupSchema validates firstName, lastName, email, password, and passwordConfirmation.
 *
 * NOTE: Full end-to-end testing of the page with all UI components requires
 * integration testing due to complex dependencies (Radix UI, shadcn, etc).
 */
import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, signupSchema } from '@/lib/authSchema'

describe('SignUp Page - Form Validation', () => {
  const validData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    password: 'password123',
    passwordConfirmation: 'password123',
  }

  describe('signupSchema validation', () => {
    // ============================================================
    // Valid Input Scenarios
    // ============================================================
    describe('valid input', () => {
      it('should validate correct signup data', () => {
        const result = signupSchema.safeParse(validData)
        expect(result.success).toBe(true)
      })

      it('should accept names with special characters', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: 'Mary-Jane',
          lastName: "O'Brien",
        })
        expect(result.success).toBe(true)
      })

      it('should accept names with unicode characters', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: 'José',
          lastName: 'Müller',
        })
        expect(result.success).toBe(true)
      })

      it('should accept email with subdomain', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'user@mail.example.com',
        })
        expect(result.success).toBe(true)
      })

      it('should accept email with plus addressing', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'user+signup@example.com',
        })
        expect(result.success).toBe(true)
      })

      it('should accept password at exactly minimum length', () => {
        const minPassword = 'a'.repeat(PASSWORD_MIN_LENGTH)
        const result = signupSchema.safeParse({
          ...validData,
          password: minPassword,
          passwordConfirmation: minPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with all special characters', () => {
        const specialPassword = '!@#$%^&*()'.padEnd(
          PASSWORD_MIN_LENGTH,
          '!'
        )
        const result = signupSchema.safeParse({
          ...validData,
          password: specialPassword,
          passwordConfirmation: specialPassword,
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // First Name Validation Scenarios
    // ============================================================
    describe('firstName validation', () => {
      it('should reject empty first name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'First name is required'
          )
        }
      })

      it('should accept single character first name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: 'J',
        })
        expect(result.success).toBe(true)
      })

      it('should accept very long first name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: 'A'.repeat(100),
        })
        expect(result.success).toBe(true)
      })

      it('should accept first name with numbers', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: 'John3',
        })
        expect(result.success).toBe(true)
      })

      it('should accept whitespace-only first name (min length check)', () => {
        // This tests that whitespace-only is treated as non-empty
        const result = signupSchema.safeParse({
          ...validData,
          firstName: '   ',
        })
        // Note: Current schema uses min(1) which accepts whitespace
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Last Name Validation Scenarios
    // ============================================================
    describe('lastName validation', () => {
      it('should reject empty last name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          lastName: '',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Last name is required'
          )
        }
      })

      it('should accept single character last name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          lastName: 'D',
        })
        expect(result.success).toBe(true)
      })

      it('should accept hyphenated last name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          lastName: 'Smith-Jones',
        })
        expect(result.success).toBe(true)
      })

      it('should accept last name with apostrophe', () => {
        const result = signupSchema.safeParse({
          ...validData,
          lastName: "O'Connor",
        })
        expect(result.success).toBe(true)
      })

      it('should accept very long last name', () => {
        const result = signupSchema.safeParse({
          ...validData,
          lastName: 'B'.repeat(100),
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Email Validation Scenarios
    // ============================================================
    describe('email validation', () => {
      it('should reject invalid email', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'invalid',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Invalid email address'
          )
        }
      })

      it('should reject empty email', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email without @', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'john.example.com',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email without domain', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'john@',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email without local part', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: '@example.com',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email with spaces', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'john doe@example.com',
        })
        expect(result.success).toBe(false)
      })

      it('should reject email with multiple @ symbols', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 'john@@example.com',
        })
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Password Validation Scenarios
    // ============================================================
    describe('password validation', () => {
      it('should reject password shorter than minimum', () => {
        const shortPassword = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
        const result = signupSchema.safeParse({
          ...validData,
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
        const result = signupSchema.safeParse({
          ...validData,
          password: '',
          passwordConfirmation: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject single character password', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 'a',
          passwordConfirmation: 'a',
        })
        expect(result.success).toBe(false)
      })

      it('should accept password just over minimum length', () => {
        const password = 'a'.repeat(PASSWORD_MIN_LENGTH + 1)
        const result = signupSchema.safeParse({
          ...validData,
          password: password,
          passwordConfirmation: password,
        })
        expect(result.success).toBe(true)
      })

      it('should accept very long password', () => {
        const longPassword = 'a'.repeat(1000)
        const result = signupSchema.safeParse({
          ...validData,
          password: longPassword,
          passwordConfirmation: longPassword,
        })
        expect(result.success).toBe(true)
      })

      it('should accept password with unicode characters', () => {
        const unicodePassword = 'пароль密码абв'
        const result = signupSchema.safeParse({
          ...validData,
          password: unicodePassword,
          passwordConfirmation: unicodePassword,
        })
        expect(result.success).toBe(true)
      })
    })

    // ============================================================
    // Password Confirmation Validation Scenarios
    // ============================================================
    describe('passwordConfirmation validation', () => {
      it('should reject mismatched passwords', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 'password123',
          passwordConfirmation: 'different456',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          const mismatchError = result.error.issues.find((issue) =>
            issue.path.includes('passwordConfirmation')
          )
          expect(mismatchError?.message).toBe(
            'Passwords do not match'
          )
        }
      })

      it('should reject when passwords differ by case', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 'Password123',
          passwordConfirmation: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when password is valid but confirmation is empty', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 'validpassword123',
          passwordConfirmation: '',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when password has trailing space and confirmation does not', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 'password123 ',
          passwordConfirmation: 'password123',
        })
        expect(result.success).toBe(false)
      })

      it('should reject when confirmation has extra characters', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 'password123',
          passwordConfirmation: 'password1234',
        })
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Missing Fields Scenarios
    // ============================================================
    describe('missing fields', () => {
      it('should reject when firstName is missing', () => {
        const { firstName, ...withoutFirstName } = validData
        const result = signupSchema.safeParse(withoutFirstName)
        expect(result.success).toBe(false)
      })

      it('should reject when lastName is missing', () => {
        const { lastName, ...withoutLastName } = validData
        const result = signupSchema.safeParse(withoutLastName)
        expect(result.success).toBe(false)
      })

      it('should reject when email is missing', () => {
        const { email, ...withoutEmail } = validData
        const result = signupSchema.safeParse(withoutEmail)
        expect(result.success).toBe(false)
      })

      it('should reject when password is missing', () => {
        const { password, ...withoutPassword } = validData
        const result = signupSchema.safeParse(withoutPassword)
        expect(result.success).toBe(false)
      })

      it('should reject when passwordConfirmation is missing', () => {
        const { passwordConfirmation, ...withoutConfirmation } =
          validData
        const result = signupSchema.safeParse(withoutConfirmation)
        expect(result.success).toBe(false)
      })

      it('should reject empty object', () => {
        const result = signupSchema.safeParse({})
        expect(result.success).toBe(false)
      })
    })

    // ============================================================
    // Edge Cases
    // ============================================================
    describe('edge cases', () => {
      it('should handle null values gracefully', () => {
        const result = signupSchema.safeParse({
          firstName: null,
          lastName: null,
          email: null,
          password: null,
          passwordConfirmation: null,
        })
        expect(result.success).toBe(false)
      })

      it('should handle undefined values gracefully', () => {
        const result = signupSchema.safeParse({
          firstName: undefined,
          lastName: undefined,
          email: undefined,
          password: undefined,
          passwordConfirmation: undefined,
        })
        expect(result.success).toBe(false)
      })

      it('should reject non-string firstName', () => {
        const result = signupSchema.safeParse({
          ...validData,
          firstName: 123,
        })
        expect(result.success).toBe(false)
      })

      it('should reject non-string email', () => {
        const result = signupSchema.safeParse({
          ...validData,
          email: 123,
        })
        expect(result.success).toBe(false)
      })

      it('should reject non-string password', () => {
        const result = signupSchema.safeParse({
          ...validData,
          password: 123,
        })
        expect(result.success).toBe(false)
      })

      it('should verify PASSWORD_MIN_LENGTH constant is 8', () => {
        expect(PASSWORD_MIN_LENGTH).toBe(8)
      })
    })

    // ============================================================
    // Multiple Validation Errors
    // ============================================================
    describe('multiple validation errors', () => {
      it('should return multiple errors for multiple invalid fields', () => {
        const result = signupSchema.safeParse({
          firstName: '',
          lastName: '',
          email: 'invalid',
          password: 'short',
          passwordConfirmation: 'different',
        })
        expect(result.success).toBe(false)
        if (!result.success) {
          // Should have at least 3 errors: firstName, lastName, email, password length
          expect(result.error.issues.length).toBeGreaterThanOrEqual(3)
        }
      })
    })
  })
})
