import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import { NotFoundError } from '@/db/tableUtils'
import { ValidationError } from '@/errors'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import { sendOrganizationPayoutsEnabledNotificationEmail } from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'

/**
 * Core run function for send-organization-payouts-enabled-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationPayoutsEnabledNotification =
  async (params: { organizationId: string }) => {
    const { organizationId } = params

    if (!organizationId) {
      return Result.err(
        new ValidationError(
          'organizationId',
          'organizationId is required'
        )
      )
    }

    logger.log('Sending organization payouts enabled notification', {
      organizationId,
      payload: params,
    })

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
                organizationId,
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

    const recipientEmails = usersAndMemberships
      .map(({ user }) => user.email)
      .filter((email) => !isNil(email))

    if (recipientEmails.length === 0) {
      return Result.err(
        new ValidationError(
          'recipients',
          `No recipient emails found for organization ${organizationId}`
        )
      )
    }

    await sendOrganizationPayoutsEnabledNotificationEmail({
      to: recipientEmails,
      organizationName: organization.name,
    })

    return Result.ok({
      message:
        'Organization payouts enabled notification sent successfully',
    })
  }

const sendOrganizationPayoutsEnabledNotificationTask = task({
  id: 'send-organization-payouts-enabled-notification',
  run: async (payload: { organizationId: string }, { ctx }) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationPayoutsEnabledNotification(payload)
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
