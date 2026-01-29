import { describe, expect, it } from 'vitest'
import {
  newPasswordSchema,
  PASSWORD_MIN_LENGTH,
  signInSchema,
  signupSchema,
} from './schemas'

describe('signInSchema', () => {
  describe('valid input', () => {
    it('should accept valid email and password', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('email validation', () => {
    it('should reject empty email', () => {
      const result = signInSchema.safeParse({
        email: '',
        password: 'password123',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Please enter a valid email'
        )
      }
    })

    it('should reject invalid email format', () => {
      const result = signInSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
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
        password: 'password123',
      })
      expect(result.success).toBe(false)
    })
  })

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

    it('should accept any non-empty password', () => {
      const result = signInSchema.safeParse({
        email: 'test@example.com',
        password: 'a',
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('signupSchema', () => {
  const validSignup = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    password: 'password123',
    passwordConfirmation: 'password123',
  }

  describe('valid input', () => {
    it('should accept valid signup data', () => {
      const result = signupSchema.safeParse(validSignup)
      expect(result.success).toBe(true)
    })
  })

  describe('firstName validation', () => {
    it('should reject empty firstName', () => {
      const result = signupSchema.safeParse({
        ...validSignup,
        firstName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'First name is required'
        )
      }
    })
  })

  describe('lastName validation', () => {
    it('should reject empty lastName', () => {
      const result = signupSchema.safeParse({
        ...validSignup,
        lastName: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Last name is required'
        )
      }
    })
  })

  describe('email validation', () => {
    it('should reject invalid email', () => {
      const result = signupSchema.safeParse({
        ...validSignup,
        email: 'not-an-email',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Invalid email address'
        )
      }
    })
  })

  describe('password validation', () => {
    it('should reject password shorter than minimum length', () => {
      const shortPassword = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
      const result = signupSchema.safeParse({
        ...validSignup,
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

    it('should accept password at minimum length', () => {
      const minPassword = 'a'.repeat(PASSWORD_MIN_LENGTH)
      const result = signupSchema.safeParse({
        ...validSignup,
        password: minPassword,
        passwordConfirmation: minPassword,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('passwordConfirmation validation', () => {
    it('should reject mismatched passwords', () => {
      const result = signupSchema.safeParse({
        ...validSignup,
        password: 'password123',
        passwordConfirmation: 'different456',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const mismatchError = result.error.issues.find((issue) =>
          issue.path.includes('passwordConfirmation')
        )
        expect(mismatchError?.message).toBe('Passwords do not match')
      }
    })
  })
})

describe('newPasswordSchema', () => {
  describe('valid input', () => {
    it('should accept matching valid passwords', () => {
      const result = newPasswordSchema.safeParse({
        password: 'newpassword123',
        passwordConfirmation: 'newpassword123',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('password validation', () => {
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
  })

  describe('passwordConfirmation validation', () => {
    it('should reject mismatched passwords', () => {
      const result = newPasswordSchema.safeParse({
        password: 'newpassword123',
        passwordConfirmation: 'differentpassword',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const mismatchError = result.error.issues.find((issue) =>
          issue.path.includes('passwordConfirmation')
        )
        expect(mismatchError?.message).toBe('Passwords do not match')
      }
    })
  })
})
