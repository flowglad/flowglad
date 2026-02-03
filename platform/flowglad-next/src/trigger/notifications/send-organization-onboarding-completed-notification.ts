import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import axios from 'axios'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { ValidationError } from '@/errors'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import core, { isNil } from '@/utils/core'
import { sendOrganizationOnboardingCompletedNotificationEmail } from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'

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

/**
 * Core run function for send-organization-onboarding-completed-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationOnboardingCompletedNotification =
  async (params: { organizationId: string }) => {
    logger.log(
      'Sending organization onboarding completed notification',
      {
        organizationId: params.organizationId,
      }
    )

    let dataResult: Result<
      {
        organization: Organization.Record
        usersAndMemberships: Array<{
          user: User.Record
          membership: Membership.Record
        }>
      },
      NotFoundError | ValidationError
    >
    try {
      const data = (
        await adminTransaction(async ({ transaction }) => {
          return Result.ok(
            await buildNotificationContext(
              {
                organizationId: params.organizationId,
                include: ['usersAndMemberships'],
              },
              transaction
            )
          )
        })
      ).unwrap()
      dataResult = Result.ok(data)
    } catch (error) {
      // Only convert NotFoundError to Result.err; rethrow other errors
      // for Trigger.dev to retry (e.g., transient DB failures)
      if (error instanceof NotFoundError) {
        dataResult = Result.err(error)
      } else if (
        error instanceof Error &&
        error.message.includes('not found')
      ) {
        // Handle errors from buildNotificationContext
        dataResult = Result.err(
          new NotFoundError('Resource', error.message)
        )
      } else {
        throw error
      }
    }

    if (Result.isError(dataResult)) {
      return dataResult
    }
    const { organization, usersAndMemberships } = dataResult.value

    const recipients = usersAndMemberships
      .map(({ user }) => user.email)
      .filter((email) => !isNil(email))

    if (recipients.length === 0) {
      return Result.err(
        new ValidationError(
          'recipients',
          'No recipient emails found for organization'
        )
      )
    }

    await sendOrganizationOnboardingCompletedNotificationEmail({
      to: recipients,
      organizationName: organization.name,
    })
    await notifyFlowgladTeamPayoutsEnabled({
      organizationId: organization.id,
      organizationName: organization.name,
    })
    return Result.ok({
      message:
        'Organization onboarding completed notification sent successfully',
    })
  }

const sendOrganizationOnboardingCompletedNotificationTask = task({
  id: 'send-organization-onboarding-completed-notification',
  run: async (payload: { organizationId: string }, { ctx }) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationOnboardingCompletedNotification(payload)
  },
})

export const idempotentSendOrganizationOnboardingCompletedNotification =
  async (organizationId: string) => {
    await sendOrganizationOnboardingCompletedNotificationTask.trigger(
      { organizationId },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-organization-onboarding-completed-notification-${organizationId}`
        ),
      }
    )
  }
