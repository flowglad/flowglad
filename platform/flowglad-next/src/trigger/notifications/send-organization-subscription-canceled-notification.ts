import { isNil } from '@/utils/core'
import { logger, task } from '@trigger.dev/sdk'
import { Subscription } from '@/db/schema/subscriptions'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { OrganizationSubscriptionCanceledNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import { safeSend } from '@/utils/email'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'

export const sendOrganizationSubscriptionCanceledNotificationTask =
  task({
    id: 'send-organization-subscription-canceled-notification',
    run: async (
      {
        subscription,
      }: {
        subscription: Subscription.Record
      },
      { ctx }
    ) => {
      logger.log(
        'Sending organization subscription canceled notification',
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
      await safeSend({
        from: 'Flowglad <notifications@flowglad.com>',
        to: usersAndMemberships
          .map(({ user }) => user.email)
          .filter((email) => !isNil(email)),
        subject: `Subscription Cancelled: ${customer.name} canceled ${subscription.name}`,
        react: OrganizationSubscriptionCanceledNotificationEmail({
          organizationName: organization.name,
          subscriptionName: subscription.name!,
          customerId: customer.id,
          customerName: customer.name,
          customerEmail: customer.email,
          cancellationDate:
            subscription.cancelScheduledAt ||
            subscription.canceledAt ||
            new Date(),
        }),
      })

      return {
        message:
          'Organization subscription canceled notification sent successfully',
      }
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
