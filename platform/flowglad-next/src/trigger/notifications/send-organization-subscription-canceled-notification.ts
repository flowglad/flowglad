import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import { NotFoundError } from '@/db/tableUtils'
import { OrganizationSubscriptionCanceledNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import { ValidationError } from '@/errors'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'
import { filterEligibleRecipients } from '@/utils/notifications'

/**
 * Core run function for send-organization-subscription-canceled-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationSubscriptionCanceledNotification =
  async (params: { subscription: Subscription.Record }) => {
    const { subscription } = params
    logger.log(
      'Sending organization subscription canceled notification',
      {
        subscription,
      }
    )

    let dataResult: Result<
      {
        organization: Organization.Record
        customer: Customer.Record
        usersAndMemberships: Array<{
          user: User.Record
          membership: Membership.Record
        }>
      },
      NotFoundError | ValidationError
    >
    try {
      const data = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: subscription.organizationId,
            customerId: subscription.customerId,
            include: ['usersAndMemberships'],
          },
          transaction
        )
      })
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
    const { organization, customer, usersAndMemberships } =
      dataResult.value

    const eligibleRecipients = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCanceled',
      subscription.livemode
    )

    if (eligibleRecipients.length === 0) {
      return Result.ok({
        message: 'No recipients opted in for this notification',
      })
    }

    const recipientEmails = eligibleRecipients
      .map(({ user }) => user.email)
      .filter(
        (email): email is string => !isNil(email) && email !== ''
      )

    if (recipientEmails.length === 0) {
      return Result.ok({
        message: 'No valid email addresses for eligible recipients',
      })
    }

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `Subscription Cancelled: ${customer.name} canceled ${subscription.name ?? 'their subscription'}`,
        subscription.livemode
      ),
      /**
       * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
       */
      react: await OrganizationSubscriptionCanceledNotificationEmail({
        organizationName: organization.name,
        subscriptionName: subscription.name ?? 'Unnamed subscription',
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        cancellationDate: new Date(
          subscription.cancelScheduledAt ||
            subscription.canceledAt ||
            Date.now()
        ),
        livemode: subscription.livemode,
      }),
    })

    return Result.ok({
      message:
        'Organization subscription canceled notification sent successfully',
    })
  }

const sendOrganizationSubscriptionCanceledNotificationTask = task({
  id: 'send-organization-subscription-canceled-notification',
  run: async (
    payload: {
      subscription: Subscription.Record
    },
    { ctx }
  ) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationSubscriptionCanceledNotification(payload)
  },
})

export const idempotentSendOrganizationSubscriptionCanceledNotification =
  testSafeTriggerInvoker(
    async (subscription: Subscription.Record) => {
      await sendOrganizationSubscriptionCanceledNotificationTask.trigger(
        {
          subscription,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-subscription-canceled-notification-${subscription.id}`
          ),
        }
      )
    }
  )
