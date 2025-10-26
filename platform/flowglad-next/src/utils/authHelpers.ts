import { adminTransaction } from '@/db/adminTransaction'
import { User as UserSchema } from '@/db/schema/users'
import {
  insertUser,
  selectUsers,
  updateUser,
} from '@/db/tableMethods/userMethods'
import { User } from 'better-auth'

export const betterAuthUserToApplicationUser = async (
  betterAuthUser: User
): Promise<UserSchema.Record> => {
  return await adminTransaction(async ({ transaction }) => {
    const [existingUser] = await selectUsers(
      {
        email: betterAuthUser.email,
      },
      transaction
    )
    if (!existingUser) {
      return await insertUser(
        {
          id: betterAuthUser.id,
          email: betterAuthUser.email,
          name: betterAuthUser.name,
          betterAuthId: betterAuthUser.id,
        },
        transaction
      )
    }
    if (existingUser.betterAuthId !== betterAuthUser.id) {
      return await updateUser(
        {
          id: existingUser.id,
          betterAuthId: betterAuthUser.id,
        },
        transaction
      )
    }
    return existingUser
  })
}
