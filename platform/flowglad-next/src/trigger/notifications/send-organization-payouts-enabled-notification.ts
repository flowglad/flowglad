import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import { sendOrganizationPayoutsEnabledNotificationEmail } from '@/utils/email'

const sendOrganizationPayoutsEnabledNotificationTask = task({
  id: 'send-organization-payouts-enabled-notification',
  run: async (payload: { organizationId: string }, { ctx }) => {
    const { organizationId } = payload

    if (!organizationId) {
      throw new Error(
        'organizationId is required. Received payload: ' +
          JSON.stringify(payload)
      )
    }

    logger.log('Sending organization payouts enabled notification', {
      organizationId,
      ctx,
      payload,
    })

    const { organization, usersAndMemberships } = (
      await adminTransaction(async ({ transaction }) => {
        const organization = await selectOrganizationById(
          organizationId,
          transaction
        )
        if (!organization) {
          throw new Error(`Organization not found: ${organizationId}`)
        }
        const usersAndMemberships =
          await selectMembershipsAndUsersByMembershipWhere(
            {
              organizationId,
            },
            transaction
          )
        return {
          organization,
          usersAndMemberships,
        }
      })
    ).unwrap()

    const recipientEmails = usersAndMemberships
      .map(({ user }) => user.email)
      .filter((email) => !isNil(email))

    if (recipientEmails.length === 0) {
      throw new Error(
        `No recipient emails found for organization ${organizationId}`
      )
    }

    await sendOrganizationPayoutsEnabledNotificationEmail({
      to: recipientEmails,
      organizationName: organization.name,
    })

    return {
      message:
        'Organization payouts enabled notification sent successfully',
    }
  },
})

export const idempotentSendOrganizationPayoutsEnabledNotification =
  testSafeTriggerInvoker(async (organizationId: string) => {
    await sendOrganizationPayoutsEnabledNotificationTask.trigger(
      {
        organizationId,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-organization-payouts-enabled-notification-${organizationId}`
        ),
      }
    )
  })
