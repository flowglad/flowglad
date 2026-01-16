/**
 * Sign-Up Page Tests
 *
 * NOTE: These tests focus on the form validation schema and basic behavior.
 * Full end-to-end testing of the page with all UI components requires
 * integration testing due to complex dependencies (Radix UI, shadcn, etc).
 *
 * For now, the form validation logic is tested in src/lib/schemas.test.ts
 */
import { describe, it, expect } from 'vitest'
import { signupSchema, PASSWORD_MIN_LENGTH } from '@/lib/schemas'

describe('SignUp Page - Form Validation', () => {
  const validData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    password: 'password123',
    passwordConfirmation: 'password123',
  }

  describe('signupSchema validation', () => {
    it('should validate correct signup data', () => {
      const result = signupSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('should reject empty first name', () => {
      const result = signupSchema.safeParse({
        ...validData,
        firstName: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty last name', () => {
      const result = signupSchema.safeParse({
        ...validData,
        lastName: '',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email', () => {
      const result = signupSchema.safeParse({
        ...validData,
        email: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('should reject password shorter than minimum', () => {
      const shortPassword = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
      const result = signupSchema.safeParse({
        ...validData,
        password: shortPassword,
        passwordConfirmation: shortPassword,
      })
      expect(result.success).toBe(false)
    })

    it('should reject mismatched passwords', () => {
      const result = signupSchema.safeParse({
        ...validData,
        password: 'password123',
        passwordConfirmation: 'different456',
      })
      expect(result.success).toBe(false)
    })
  })
})
