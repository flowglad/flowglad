import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import type { Subscription } from '@/db/schema/subscriptions'
import { OrganizationSubscriptionCancellationScheduledNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { formatDate, isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'
import { filterEligibleRecipients } from '@/utils/notifications'

const sendOrganizationSubscriptionCancellationScheduledNotificationTask =
  task({
    id: 'send-organization-subscription-cancellation-scheduled-notification',
    run: async (
      {
        subscription,
        scheduledCancellationDate,
      }: {
        subscription: Subscription.Record
        scheduledCancellationDate: number
      },
      { ctx }
    ) => {
      logger.log(
        'Sending organization subscription cancellation scheduled notification',
        {
          subscription,
          scheduledCancellationDate,
          ctx,
        }
      )

      const { organization, customer, usersAndMemberships } =
        await adminTransaction(async ({ transaction }) => {
          return buildNotificationContext(
            {
              organizationId: subscription.organizationId,
              customerId: subscription.customerId,
              include: ['usersAndMemberships'],
            },
            transaction
          )
        })

      const eligibleRecipients = filterEligibleRecipients(
        usersAndMemberships,
        'subscriptionCancellationScheduled',
        subscription.livemode
      )

      if (eligibleRecipients.length === 0) {
        return {
          message: 'No recipients opted in for this notification',
        }
      }

      const recipientEmails = eligibleRecipients
        .map(({ user }) => user.email)
        .filter(
          (email): email is string => !isNil(email) && email !== ''
        )

      if (recipientEmails.length === 0) {
        return {
          message: 'No valid email addresses for eligible recipients',
        }
      }

      const cancellationDate = new Date(scheduledCancellationDate)
      const subscriptionName = subscription.name || 'subscription'

      await safeSend({
        from: 'Flowglad <notifications@flowglad.com>',
        bcc: getBccForLivemode(subscription.livemode),
        to: recipientEmails,
        subject: formatEmailSubject(
          `Cancellation Scheduled: ${customer.name} scheduled cancellation for ${subscriptionName} on ${formatDate(cancellationDate)}`,
          subscription.livemode
        ),
        /**
         * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
         */
        react:
          await OrganizationSubscriptionCancellationScheduledNotificationEmail(
            {
              organizationName: organization.name,
              subscriptionName,
              customerId: customer.id,
              customerName: customer.name,
              customerEmail: customer.email,
              scheduledCancellationDate: cancellationDate,
              livemode: subscription.livemode,
            }
          ),
      })

      return {
        message:
          'Organization subscription cancellation scheduled notification sent successfully',
      }
    },
  })

export const idempotentSendOrganizationSubscriptionCancellationScheduledNotification =
  testSafeTriggerInvoker(
    async (
      subscription: Subscription.Record,
      scheduledCancellationDate: number
    ) => {
      await sendOrganizationSubscriptionCancellationScheduledNotificationTask.trigger(
        {
          subscription,
          scheduledCancellationDate,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-subscription-cancellation-scheduled-notification-${subscription.id}-${scheduledCancellationDate}`
          ),
        }
      )
    }
  )
