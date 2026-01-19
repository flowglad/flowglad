import { logger, task } from '@trigger.dev/sdk'
import axios from 'axios'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import core, { isNil } from '@/utils/core'
import { sendOrganizationOnboardingCompletedNotificationEmail } from '@/utils/email'

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

  const dashboardUrl = core.safeUrl(
    `dashboard/organizations/${params.organizationId}`,
    core.envVariable('FLOWGLAD_INTERNAL_APP_URL')
  )

  const message = `🎉 Organization payouts enabled!\n\n*Organization:* ${params.organizationName}\n*Organization ID:* ${params.organizationId}\n* Action in Dashboard:* ${dashboardUrl}`

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
      webhookConfigured: Boolean(webhookUrl),
      error: error instanceof Error ? error.message : String(error),
      organizationId: params.organizationId,
      organizationName: params.organizationName,
    })
  }
}

const sendOrganizationOnboardingCompletedNotificationTask = task({
  id: 'send-organization-onboarding-completed-notification',
  run: async (payload: { organizationId: string }, { ctx }) => {
    logger.log(
      'Sending organization onboarding completed notification',
      {
        organizationId: payload.organizationId,
        ctx,
      }
    )

    const { organization, usersAndMemberships } = (
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
    ).unwrap()

    if (!organization) {
      throw new Error('Organization not found')
    }

    const recipients = usersAndMemberships
      .map(({ user }) => user.email)
      .filter((email) => !isNil(email))

    if (recipients.length === 0) {
      throw new Error('No recipient emails found for organization')
    }

    await sendOrganizationOnboardingCompletedNotificationEmail({
      to: recipients,
      organizationName: organization.name,
    })
    await notifyFlowgladTeamPayoutsEnabled({
      organizationId: organization.id,
      organizationName: organization.name,
    })
    return {
      message:
        'Organization onboarding completed notification sent successfully',
    }
  },
})

export const idempotentSendOrganizationOnboardingCompletedNotification =
  testSafeTriggerInvoker(async (organizationId: string) => {
    await sendOrganizationOnboardingCompletedNotificationTask.trigger(
      { organizationId },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-organization-onboarding-completed-notification-${organizationId}`
        ),
      }
    )
  })
