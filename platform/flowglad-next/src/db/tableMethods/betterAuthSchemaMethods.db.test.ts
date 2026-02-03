/**
 * Database tests for betterAuthSchemaMethods.
 *
 * These tests verify the updateSessionContextOrganizationId,
 * selectBetterAuthUserById, and selectBetterAuthUserByEmail functions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { session, user } from '@db-core/schema/betterAuthSchema'
import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import { adminTransaction } from '@/db/adminTransaction'
import { db } from '@/db/client'
import core from '@/utils/core'
import {
  selectBetterAuthUserByEmail,
  selectBetterAuthUserById,
  updateSessionContextOrganizationId,
} from './betterAuthSchemaMethods'

describe('updateSessionContextOrganizationId', () => {
  // Use unique IDs for each test run to avoid conflicts
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`
  const testUserId = `test_user_${uniqueId}`
  const testSessionId = `test_session_${uniqueId}`
  const testSessionToken = `test_token_${uniqueId}`

  beforeEach(async () => {
    // Create a test user first (due to foreign key constraint)
    await db.insert(user).values({
      id: testUserId,
      name: 'Test User',
      email: `test_${uniqueId}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Create a test session
    await db.insert(session).values({
      id: testSessionId,
      token: testSessionToken,
      userId: testUserId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      createdAt: new Date(),
      updatedAt: new Date(),
      scope: 'customer',
      contextOrganizationId: null,
    })
  })

  afterEach(async () => {
    // Clean up test session and user (session first due to FK)
    await db.delete(session).where(eq(session.id, testSessionId))
    await db.delete(user).where(eq(user.id, testUserId))
  })

  it('sets contextOrganizationId on an existing session by token', async () => {
    const orgId = 'org_test_123'

    const result = (
      await adminTransaction(async ({ transaction }) => {
        const updatedSession =
          await updateSessionContextOrganizationId(
            testSessionToken,
            orgId,
            transaction
          )
        return Result.ok(updatedSession)
      })
    ).unwrap()

    expect(result?.contextOrganizationId).toBe(orgId)

    // Verify the update persisted
    const [updatedSession] = await db
      .select()
      .from(session)
      .where(eq(session.id, testSessionId))

    expect(updatedSession.contextOrganizationId).toBe(orgId)
  })

  it('returns undefined when session token does not exist', async () => {
    const nonExistentToken = 'non_existent_token_123'
    const orgId = 'org_test_123'

    const result = (
      await adminTransaction(async ({ transaction }) => {
        const updatedSession =
          await updateSessionContextOrganizationId(
            nonExistentToken,
            orgId,
            transaction
          )
        return Result.ok(updatedSession)
      })
    ).unwrap()

    expect(result).toBeUndefined()
  })

  it('can update contextOrganizationId multiple times', async () => {
    const orgId1 = 'org_test_first'
    const orgId2 = 'org_test_second'

    // First update
    const result1 = (
      await adminTransaction(async ({ transaction }) => {
        const updatedSession =
          await updateSessionContextOrganizationId(
            testSessionToken,
            orgId1,
            transaction
          )
        return Result.ok(updatedSession)
      })
    ).unwrap()

    expect(result1?.contextOrganizationId).toBe(orgId1)

    // Second update
    const result2 = (
      await adminTransaction(async ({ transaction }) => {
        const updatedSession =
          await updateSessionContextOrganizationId(
            testSessionToken,
            orgId2,
            transaction
          )
        return Result.ok(updatedSession)
      })
    ).unwrap()

    expect(result2?.contextOrganizationId).toBe(orgId2)

    // Verify final state
    const [updatedSession] = await db
      .select()
      .from(session)
      .where(eq(session.id, testSessionId))

    expect(updatedSession.contextOrganizationId).toBe(orgId2)
  })

  describe('Zod input validation', () => {
    it('throws ZodError when sessionToken is empty string', async () => {
      const emptyToken = ''
      const orgId = 'org_test_123'

      const result = await adminTransaction(
        async ({ transaction }) => {
          await updateSessionContextOrganizationId(
            emptyToken,
            orgId,
            transaction
          )
          return Result.ok(undefined)
        }
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Session token is required'
        )
      }
    })

    it('throws ZodError when contextOrganizationId is empty string', async () => {
      const emptyOrgId = ''

      const result = await adminTransaction(
        async ({ transaction }) => {
          await updateSessionContextOrganizationId(
            testSessionToken,
            emptyOrgId,
            transaction
          )
          return Result.ok(undefined)
        }
      )

      expect(Result.isError(result)).toBe(true)
      if (Result.isError(result)) {
        expect(result.error.message).toContain(
          'Context organization ID is required'
        )
      }
    })
  })

  describe('Zod output validation', () => {
    it('returns properly validated session object with all expected fields', async () => {
      const orgId = 'org_test_validated'

      const result = (
        await adminTransaction(async ({ transaction }) => {
          const updatedSession =
            await updateSessionContextOrganizationId(
              testSessionToken,
              orgId,
              transaction
            )
          return Result.ok(updatedSession)
        })
      ).unwrap()

      // Verify all expected fields are present and correctly typed
      // (subsequent assertions will fail if result is undefined)
      expect(typeof result!.id).toBe('string')
      expect(typeof result!.token).toBe('string')
      expect(typeof result!.userId).toBe('string')
      expect(result!.expiresAt).toBeInstanceOf(Date)
      expect(result!.createdAt).toBeInstanceOf(Date)
      expect(result!.updatedAt).toBeInstanceOf(Date)
      expect(result!.scope).toBe('customer')
      expect(result!.contextOrganizationId).toBe(orgId)
    })
  })
})

describe('selectBetterAuthUserById', () => {
  it('returns the user when a user with the given id exists', async () => {
    const userId = `bau_${core.nanoid()}`
    const userEmail = `test+${core.nanoid()}@test.com`
    const userName = 'Test User'
    ;(
      await adminTransaction(async ({ transaction }) => {
        await transaction.insert(user).values({
          id: userId,
          email: userEmail,
          name: userName,
          role: 'user',
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        return Result.ok(undefined)
      })
    ).unwrap()

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserById(userId, transaction)
        )
      })
    ).unwrap()

    expect(result.id).toBe(userId)
    expect(result.email).toBe(userEmail)
    expect(result.name).toBe(userName)
  })

  it('throws an error when no user exists with the given id', async () => {
    const nonExistentId = `bau_nonexistent_${core.nanoid()}`

    const result = await adminTransaction(async ({ transaction }) => {
      await selectBetterAuthUserById(nonExistentId, transaction)
      return Result.ok(undefined)
    })
    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toContain(
        'BetterAuth user not found'
      )
    }
  })
})

describe('selectBetterAuthUserByEmail', () => {
  it('returns the user when a user with the given email exists', async () => {
    const userId = `bau_${core.nanoid()}`
    const userEmail = `email-test+${core.nanoid()}@test.com`
    const userName = 'Email Test User'
    ;(
      await adminTransaction(async ({ transaction }) => {
        await transaction.insert(user).values({
          id: userId,
          email: userEmail,
          name: userName,
          role: 'merchant',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        return Result.ok(undefined)
      })
    ).unwrap()

    const result = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserByEmail(userEmail, transaction)
        )
      })
    ).unwrap()

    expect(result.id).toBe(userId)
    expect(result.email).toBe(userEmail)
    expect(result.name).toBe(userName)
    expect(result.role).toBe('merchant')
    expect(result.emailVerified).toBe(true)
  })

  it('throws an error when no user exists with the given email', async () => {
    const nonExistentEmail = `nonexistent+${core.nanoid()}@test.com`

    const result = await adminTransaction(async ({ transaction }) => {
      await selectBetterAuthUserByEmail(nonExistentEmail, transaction)
      return Result.ok(undefined)
    })
    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(result.error.message).toContain(
        'BetterAuth user not found'
      )
    }
  })

  it('returns the correct user when multiple users exist (email is unique)', async () => {
    const user1Id = `bau_${core.nanoid()}`
    const user1Email = `user1+${core.nanoid()}@test.com`
    const user2Id = `bau_${core.nanoid()}`
    const user2Email = `user2+${core.nanoid()}@test.com`
    ;(
      await adminTransaction(async ({ transaction }) => {
        await transaction.insert(user).values([
          {
            id: user1Id,
            email: user1Email,
            name: 'User One',
            role: 'user',
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: user2Id,
            email: user2Email,
            name: 'User Two',
            role: 'merchant',
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ])
        return Result.ok(undefined)
      })
    ).unwrap()

    const result1 = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserByEmail(user1Email, transaction)
        )
      })
    ).unwrap()

    const result2 = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserByEmail(user2Email, transaction)
        )
      })
    ).unwrap()

    expect(result1.id).toBe(user1Id)
    expect(result1.email).toBe(user1Email)
    expect(result1.name).toBe('User One')

    expect(result2.id).toBe(user2Id)
    expect(result2.email).toBe(user2Email)
    expect(result2.name).toBe('User Two')
  })
})
