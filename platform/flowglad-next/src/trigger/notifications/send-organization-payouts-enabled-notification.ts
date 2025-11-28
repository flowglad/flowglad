import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { sendOrganizationPayoutsEnabledNotificationEmail } from '@/utils/email'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import core from '@/utils/core'
import axios from 'axios'

const notifyFlowgladTeamPayoutsEnabled = async (params: {
  organizationId: string
  organizationName: string
}) => {
  const webhookUrl = core.envVariable(
    'SLACK_ENG_INCOMING_WEBHOOK_URL'
  )

  if (!webhookUrl) {
    logger.warn(
      'SLACK_ENG_INCOMING_WEBHOOK_URL not configured, skipping Slack notification'
    )
    return
  }

  const message = `Organization completed Stripe Connect:\n\n- ${params.organizationName}\n\n- ${params.organizationId}`

  try {
    await axios.post(webhookUrl, {
      text: message,
    })
    logger.log('Slack notification sent successfully', {
      organizationId: params.organizationId,
      organizationName: params.organizationName,
    })
  } catch (error) {
    logger.error('Failed to send Slack notification', {
      error: error instanceof Error ? error.message : String(error),
      organizationId: params.organizationId,
      organizationName: params.organizationName,
    })
  }
}

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

    const { organization, usersAndMemberships } =
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

    await notifyFlowgladTeamPayoutsEnabled({
      organizationId,
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
