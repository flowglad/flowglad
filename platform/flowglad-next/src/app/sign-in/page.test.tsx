/**
 * Sign-In Page Tests
 *
 * NOTE: These tests focus on the form validation schema and basic behavior.
 * Full end-to-end testing of the page with all UI components requires
 * integration testing due to complex dependencies (Radix UI, shadcn, etc).
 *
 * For now, the form validation logic is tested in src/lib/schemas.test.ts
 */
import { describe, it, expect } from 'vitest'
import { signInSchema } from '@/lib/schemas'

describe('SignIn Page - Form Validation', () => {
  describe('signInSchema validation', () => {
    it('should validate correct email and password', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: 'mypassword',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty email', () => {
      const result = signInSchema.safeParse({
        email: '',
        password: 'mypassword',
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email format', () => {
      const result = signInSchema.safeParse({
        email: 'not-an-email',
        password: 'mypassword',
      })
      expect(result.success).toBe(false)
    })

    it('should reject empty password', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: '',
      })
      expect(result.success).toBe(false)
    })
  })
})
