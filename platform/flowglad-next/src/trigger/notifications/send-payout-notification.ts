import { task, logger } from '@trigger.dev/sdk'
import { sendPayoutNotificationEmail } from '@/utils/email'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { adminTransaction } from '@/db/adminTransaction'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'

export const sendPayoutNotificationTask = task({
  id: 'send-payout-notification',
  run: async (payload: { organizationId: string }, { ctx }) => {
    logger.log('Sending payout notification', {
      organizationId: payload.organizationId,
      ctx,
    })

    const { organization, usersAndMemberships } =
      await adminTransaction(async ({ transaction }) => {
        const organization = await selectOrganizationById(
          payload.organizationId,
          transaction
        )
        const usersAndMemberships =
          await selectMembershipsAndUsersByMembershipWhere(
            {
              organizationId: payload.organizationId,
            },
            transaction
          )
        return {
          organization,
          usersAndMemberships,
        }
      })

    if (!organization) {
      throw new Error('Organization not found')
    }

    const recipients = usersAndMemberships
      .map(({ user }) => user.email)
      .filter((email) => !isNil(email))

    if (recipients.length === 0) {
      throw new Error('No recipient emails found for organization')
    }

    await sendPayoutNotificationEmail({
      to: recipients,
      organizationName: organization.name,
    })

    return { message: 'Payout notification sent successfully' }
  },
})

export const idempotentSendPayoutNotification =
  testSafeTriggerInvoker(async (organizationId: string) => {
    await sendPayoutNotificationTask.trigger(
      { organizationId },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-payout-notification-${organizationId}`
        ),
      }
    )
  })
