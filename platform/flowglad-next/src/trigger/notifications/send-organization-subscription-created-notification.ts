import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import type { Subscription } from '@/db/schema/subscriptions'
import { OrganizationSubscriptionCreatedNotificationEmail } from '@/email-templates/organization-subscription-notifications'
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

const sendOrganizationSubscriptionCreatedNotificationTask = task({
  id: 'send-organization-subscription-created-notification',
  run: async (
    {
      subscription,
    }: {
      subscription: Subscription.Record
    },
    { ctx }
  ) => {
    logger.log(
      'Sending organization subscription created notification',
      {
        subscription,
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
      'subscriptionCreated',
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

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `New Subscription: ${customer.name} subscribed to ${subscription.name ?? 'a plan'}`,
        subscription.livemode
      ),
      /**
       * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
       */
      react: await OrganizationSubscriptionCreatedNotificationEmail({
        organizationName: organization.name,
        subscriptionName: subscription.name ?? 'Unnamed subscription',
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        livemode: subscription.livemode,
      }),
    })

    return {
      message:
        'Organization subscription created notification sent successfully',
    }
  },
})

export const idempotentSendOrganizationSubscriptionCreatedNotification =
  testSafeTriggerInvoker(
    async (subscription: Subscription.Record) => {
      await sendOrganizationSubscriptionCreatedNotificationTask.trigger(
        {
          subscription,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-subscription-created-notification-${subscription.id}`
          ),
        }
      )
    }
  )
