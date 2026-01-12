import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { OrganizationSubscriptionCreatedNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import core, { isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
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
        const organization = await selectOrganizationById(
          subscription.organizationId,
          transaction
        )
        const customer = await selectCustomerById(
          subscription.customerId,
          transaction
        )
        const usersAndMemberships =
          await selectMembershipsAndUsersByMembershipWhere(
            {
              organizationId: subscription.organizationId,
            },
            transaction
          )
        return {
          organization,
          customer,
          usersAndMemberships,
        }
      })

    if (!organization || !customer) {
      throw new Error('Organization or customer not found')
    }

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
        `New Subscription: ${customer.name} subscribed to ${subscription.name}`,
        subscription.livemode
      ),
      react: OrganizationSubscriptionCreatedNotificationEmail({
        organizationName: organization.name,
        subscriptionName: subscription.name!,
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
