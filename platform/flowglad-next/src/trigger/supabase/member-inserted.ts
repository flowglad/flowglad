import { adminTransaction } from '@/db/adminTransaction'
import { Membership } from '@/db/schema/memberships'
import { selectUserById } from '@/db/tableMethods/userMethods'
import { SupabaseInsertPayload } from '@/types'
import { subscribeToNewsletter } from '@/utils/newsletter'
import { logger, task } from '@trigger.dev/sdk'

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
    if (!user) {
      throw new Error(
        `User not found for membership with userId ${userId}`
      )
    }
    if (!user.email) {
      throw new Error(
        `User with id ${user.id} does not have an email address`
      )
    }
    logger.info(`Subscribing user ${user.email} to newsletter`)
    await subscribeToNewsletter(user.email)
    return {
      message: 'OK',
    }
  },
})
