import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import type { User } from '@/db/schema/users'
import { selectUserById } from '@/db/tableMethods/userMethods'
import { NotFoundError, ValidationError } from '@/errors'
import type { SupabaseInsertPayload } from '@/types'
import { subscribeToNewsletter } from '@/utils/newsletter'

export function validateUserForNewsletter(
  user: User.Record | undefined,
  userId: string
): Result<
  User.Record & { email: string },
  NotFoundError | ValidationError
> {
  if (!user) {
    return Result.err(new NotFoundError('User', userId))
  }
  if (!user.email) {
    return Result.err(
      new ValidationError(
        'email',
        `User with id ${user.id} does not have an email address`
      )
    )
  }
  return Result.ok(user as User.Record & { email: string })
}

export const memberInsertedTask = task({
  id: 'member-inserted',
  run: async (
    payload: SupabaseInsertPayload<Membership.Record>,
    { ctx }
  ) => {
    const { userId } = payload.record
    const user = await adminTransaction(async ({ transaction }) =>
      selectUserById(userId, transaction)
    )
    const validatedUser = validateUserForNewsletter(
      user,
      userId
    ).unwrap()
    logger.info(
      `Subscribing user ${validatedUser.email} to newsletter`
    )
    await subscribeToNewsletter(validatedUser.email)
    return {
      message: 'OK',
    }
  },
})
