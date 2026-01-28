import type { User } from 'better-auth'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { User as UserSchema } from '@/db/schema/users'
import {
  insertUser,
  selectUsers,
  updateUser,
} from '@/db/tableMethods/userMethods'

export const betterAuthUserToApplicationUser = async (
  betterAuthUser: User
): Promise<UserSchema.Record> => {
  const result = await adminTransaction(async ({ transaction }) => {
    const [existingUser] = await selectUsers(
      {
        email: betterAuthUser.email,
      },
      transaction
    )
    if (!existingUser) {
      const user = await insertUser(
        {
          id: betterAuthUser.id,
          email: betterAuthUser.email,
          name: betterAuthUser.name,
          betterAuthId: betterAuthUser.id,
        },
        transaction
      )
      return Result.ok(user)
    }
    if (existingUser.betterAuthId !== betterAuthUser.id) {
      const user = await updateUser(
        {
          id: existingUser.id,
          betterAuthId: betterAuthUser.id,
        },
        transaction
      )
      return Result.ok(user)
    }
    return Result.ok(existingUser)
  })
  return result.unwrap()
}
