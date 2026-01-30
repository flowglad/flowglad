import { describe, expect, it } from 'bun:test'
import { user } from '@db-core/schema/betterAuthSchema'
import { Result } from 'better-result'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import core from '@/utils/core'
import {
  selectBetterAuthUserByEmail,
  selectBetterAuthUserById,
} from './betterAuthSchemaMethods'

describe('selectBetterAuthUserById', () => {
  it('returns the user when a user with the given id exists', async () => {
    const userId = `bau_${core.nanoid()}`
    const userEmail = `test+${core.nanoid()}@test.com`
    const userName = 'Test User'(
      await adminTransactionWithResult(async ({ transaction }) => {
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
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserById(userId, transaction)
        )
      })
    ).unwrap()

    expect(result.id).toBe(userId)
    expect(result.email).toBe(userEmail)
    expect(result.name).toBe(userName)
    expect(result.role).toBe('user')
    expect(result.emailVerified).toBe(false)
  })

  it('throws an error when no user exists with the given id', async () => {
    const nonExistentId = `bau_nonexistent_${core.nanoid()}`

    await expect(
      adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserById(nonExistentId, transaction)
        )
      })
    ).rejects.toThrow('BetterAuth user not found')
  })
})

describe('selectBetterAuthUserByEmail', () => {
  it('returns the user when a user with the given email exists', async () => {
    const userId = `bau_${core.nanoid()}`
    const userEmail = `email-test+${core.nanoid()}@test.com`
    const userName = 'Email Test User'(
      await adminTransactionWithResult(async ({ transaction }) => {
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
      await adminTransactionWithResult(async ({ transaction }) => {
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

    await expect(
      adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserByEmail(
            nonExistentEmail,
            transaction
          )
        )
      })
    ).rejects.toThrow('BetterAuth user not found')
  })

  it('returns the correct user when multiple users exist (email is unique)', async () => {
    const user1Id = `bau_${core.nanoid()}`
    const user1Email = `user1+${core.nanoid()}@test.com`
    const user2Id = `bau_${core.nanoid()}`
    const user2Email = `user2+${core.nanoid()}@test.com`(
      await adminTransactionWithResult(async ({ transaction }) => {
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
      await adminTransactionWithResult(async ({ transaction }) => {
        return Result.ok(
          await selectBetterAuthUserByEmail(user1Email, transaction)
        )
      })
    ).unwrap()

    const result2 = (
      await adminTransactionWithResult(async ({ transaction }) => {
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
