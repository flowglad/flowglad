import { describe, expect, it } from 'bun:test'
import type { User } from '@db-core/schema/users'
import { NotFoundError, ValidationError } from '@/errors'
import { validateUserForNewsletter } from './member-inserted'

const createTestUser = (
  overrides: Partial<User.Record> = {}
): User.Record => ({
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  clerkId: null,
  betterAuthId: null,
  stackAuthId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdByCommit: null,
  updatedByCommit: null,
  position: 1,
  ...overrides,
})

describe('validateUserForNewsletter', () => {
  it('returns NotFoundError when user is undefined', () => {
    const result = validateUserForNewsletter(undefined, 'user_123')

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(NotFoundError)
      expect(result.error._tag).toBe('NotFoundError')
      expect((result.error as NotFoundError).resource).toBe('User')
      expect((result.error as NotFoundError).id).toBe('user_123')
    }
  })

  it('returns ValidationError when user has empty string email', () => {
    // Test the validation logic for falsy email values
    const userWithEmptyEmail = createTestUser({
      id: 'user_456',
      email: '', // Empty string is falsy
    }) as User.Record

    const result = validateUserForNewsletter(
      userWithEmptyEmail,
      'user_456'
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBeInstanceOf(ValidationError)
      expect(result.error._tag).toBe('ValidationError')
      expect((result.error as ValidationError).field).toBe('email')
      expect((result.error as ValidationError).reason).toBe(
        'User with id user_456 does not have an email address'
      )
    }
  })

  it('returns Result.ok with user when user has valid email', () => {
    const validUser = createTestUser({
      id: 'user_789',
      email: 'test@example.com',
    })

    const result = validateUserForNewsletter(validUser, 'user_789')

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.value.id).toBe('user_789')
      expect(result.value.email).toBe('test@example.com')
    }
  })
})
