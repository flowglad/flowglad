import type { User as UserSchema } from '@db-core/schema/users'
import type { User } from 'better-auth'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import {
  insertUser,
  selectUsers,
  updateUser,
} from '@/db/tableMethods/userMethods'

export const betterAuthUserToApplicationUser = async (
  betterAuthUser: User
): Promise<UserSchema.Record> => {
  return (
    await adminTransaction(async ({ transaction }) => {
      const [existingUser] = await selectUsers(
        {
          email: betterAuthUser.email,
        },
        transaction
      )
      if (!existingUser) {
        return Result.ok(
          await insertUser(
            {
              id: betterAuthUser.id,
              email: betterAuthUser.email,
              name: betterAuthUser.name,
              betterAuthId: betterAuthUser.id,
            },
            transaction
          )
        )
      }
      if (existingUser.betterAuthId !== betterAuthUser.id) {
        return Result.ok(
          await updateUser(
            {
              id: existingUser.id,
              betterAuthId: betterAuthUser.id,
            },
            transaction
          )
        )
      }
      return Result.ok(existingUser)
    })
  ).unwrap()
}
