import { beforeEach, describe, expect, it } from 'bun:test'
import { adminTransaction } from '@/db/adminTransaction'
import type { User } from '@/db/schema/users'
import core from '@/utils/core'
import {
  insertUser,
  selectUserById,
  selectUsers,
  updateUser,
  upsertUserById,
} from './userMethods'

describe('insertUser', () => {
  it('creates a new user record with required fields (id and email)', async () => {
    const userId = `user_${core.nanoid()}`
    const userEmail = `test+${core.nanoid()}@test.com`

    const user = await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: userEmail,
        },
        transaction
      )
    })

    expect(user.id).toBe(userId)
    expect(user.email).toBe(userEmail)
    expect(user.name).toBeNull()
  })

  it('creates a user with optional name field', async () => {
    const userId = `user_${core.nanoid()}`
    const userEmail = `test+${core.nanoid()}@test.com`
    const userName = 'Test User'

    const user = await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: userEmail,
          name: userName,
        },
        transaction
      )
    })

    expect(user.id).toBe(userId)
    expect(user.email).toBe(userEmail)
    expect(user.name).toBe(userName)
  })

  it('creates a user with betterAuthId', async () => {
    const userId = `user_${core.nanoid()}`
    const userEmail = `test+${core.nanoid()}@test.com`
    const betterAuthId = `ba_${core.nanoid()}`

    const user = await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: userEmail,
          betterAuthId,
        },
        transaction
      )
    })

    expect(user.id).toBe(userId)
    expect(user.betterAuthId).toBe(betterAuthId)
  })

  it('fails when inserting duplicate id', async () => {
    const userId = `user_${core.nanoid()}`
    const userEmail1 = `test+${core.nanoid()}@test.com`
    const userEmail2 = `test+${core.nanoid()}@test.com`

    await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: userEmail1,
        },
        transaction
      )
    })

    let errorThrown = false
    try {
      await adminTransaction(async ({ transaction }) => {
        return insertUser(
          {
            id: userId,
            email: userEmail2,
          },
          transaction
        )
      })
    } catch (error) {
      errorThrown = true
    }

    expect(errorThrown).toBe(true)
  })
})

describe('selectUserById', () => {
  it('returns user record when id exists', async () => {
    const userId = `user_${core.nanoid()}`
    const userEmail = `test+${core.nanoid()}@test.com`
    const userName = 'Select Test User'

    await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: userEmail,
          name: userName,
        },
        transaction
      )
    })

    const user = await adminTransaction(async ({ transaction }) => {
      return selectUserById(userId, transaction)
    })

    expect(user.id).toBe(userId)
    expect(user.email).toBe(userEmail)
    expect(user.name).toBe(userName)
  })
})

describe('selectUsers', () => {
  it('returns users matching email condition', async () => {
    const uniqueEmail = `uniqueselect+${core.nanoid()}@test.com`
    const userId = `user_${core.nanoid()}`

    await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: uniqueEmail,
          name: 'User for Select Test',
        },
        transaction
      )
    })

    const users = await adminTransaction(async ({ transaction }) => {
      return selectUsers({ email: uniqueEmail }, transaction)
    })

    expect(users.length).toBe(1)
    expect(users[0].email).toBe(uniqueEmail)
    expect(users[0].id).toBe(userId)
  })

  it('returns empty array when no users match condition', async () => {
    const nonExistentEmail = `nonexistent+${core.nanoid()}@test.com`

    const users = await adminTransaction(async ({ transaction }) => {
      return selectUsers({ email: nonExistentEmail }, transaction)
    })

    expect(users.length).toBe(0)
  })

  it('returns users matching name condition', async () => {
    const uniqueName = `UniqueNameForTest_${core.nanoid()}`
    const userId = `user_${core.nanoid()}`

    await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: `test+${core.nanoid()}@test.com`,
          name: uniqueName,
        },
        transaction
      )
    })

    const users = await adminTransaction(async ({ transaction }) => {
      return selectUsers({ name: uniqueName }, transaction)
    })

    expect(users.length).toBe(1)
    expect(users[0].name).toBe(uniqueName)
    expect(users[0].id).toBe(userId)
  })
})

describe('updateUser', () => {
  let testUser: User.Record
  let testUserId: string
  let testUserEmail: string

  beforeEach(async () => {
    testUserId = `user_${core.nanoid()}`
    testUserEmail = `test+${core.nanoid()}@test.com`

    testUser = await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: testUserId,
          email: testUserEmail,
          name: 'Original Name',
        },
        transaction
      )
    })
  })

  it('updates user name field', async () => {
    const newName = 'Updated Name'

    const updatedUser = await adminTransaction(async ({ transaction }) => {
      return updateUser(
        {
          id: testUserId,
          name: newName,
        },
        transaction
      )
    })

    expect(updatedUser.name).toBe(newName)
    expect(updatedUser.id).toBe(testUserId)
  })

  it('updates user email field', async () => {
    const newEmail = `updated+${core.nanoid()}@test.com`

    const updatedUser = await adminTransaction(async ({ transaction }) => {
      return updateUser(
        {
          id: testUserId,
          email: newEmail,
        },
        transaction
      )
    })

    expect(updatedUser.email).toBe(newEmail)
    expect(updatedUser.id).toBe(testUserId)
  })

  it('does not modify other fields when updating single field', async () => {
    const newName = 'New Name Only'

    const updatedUser = await adminTransaction(async ({ transaction }) => {
      return updateUser(
        {
          id: testUserId,
          name: newName,
        },
        transaction
      )
    })

    expect(updatedUser.name).toBe(newName)
    expect(updatedUser.email).toBe(testUserEmail)
  })
})

describe('upsertUserById', () => {
  // NOTE: createUpsertFunction uses onConflictDoNothing, NOT onConflictDoUpdate
  // This means it returns the inserted record if new, or an empty array if the record already exists

  it('inserts new user when id does not exist', async () => {
    const newUserId = `user_${core.nanoid()}`
    const newUserEmail = `upsert+${core.nanoid()}@test.com`

    const users = await adminTransaction(async ({ transaction }) => {
      return upsertUserById(
        {
          id: newUserId,
          email: newUserEmail,
          name: 'Upserted User',
        },
        transaction
      )
    })

    expect(users.length).toBe(1)
    expect(users[0].id).toBe(newUserId)
    expect(users[0].email).toBe(newUserEmail)
    expect(users[0].name).toBe('Upserted User')
  })

  it('returns empty array when id already exists (onConflictDoNothing behavior)', async () => {
    const userId = `user_${core.nanoid()}`
    const originalEmail = `original+${core.nanoid()}@test.com`

    // First, insert the user
    await adminTransaction(async ({ transaction }) => {
      return insertUser(
        {
          id: userId,
          email: originalEmail,
          name: 'Original',
        },
        transaction
      )
    })

    // Try to upsert with the same ID - should return empty array
    const updatedEmail = `updated+${core.nanoid()}@test.com`
    const users = await adminTransaction(async ({ transaction }) => {
      return upsertUserById(
        {
          id: userId,
          email: updatedEmail,
          name: 'Updated Via Upsert',
        },
        transaction
      )
    })

    // onConflictDoNothing returns empty array when conflict occurs
    expect(users.length).toBe(0)

    // Verify the original record was NOT updated
    const originalUser = await adminTransaction(async ({ transaction }) => {
      return selectUserById(userId, transaction)
    })
    expect(originalUser.email).toBe(originalEmail)
    expect(originalUser.name).toBe('Original')
  })
})

// NOTE: upsertUsersByEmail and upsertUsersByName tests are not included
// because these functions require unique indexes on email and name columns,
// but the current schema only has regular (non-unique) indexes.
// See: src/db/schema/users.ts - constructIndex creates regular indexes, not unique.

