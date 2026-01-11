 
import { describe, it, expect } from 'vitest'
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@/lib/schemas'

describe('Reset Password Page - Form Validation', () => {
  const validData = {
    password: 'newpassword123',
    passwordConfirmation: 'newpassword123',
  }

  describe('newPasswordSchema validation', () => {
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
  })
})
