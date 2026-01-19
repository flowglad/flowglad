import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionCancellationScheduledEmail } from '@/email-templates/customer-subscription-cancellation-scheduled'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { formatDate } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'

const sendCustomerSubscriptionCancellationScheduledNotificationTask =
  task({
    id: 'send-customer-subscription-cancellation-scheduled-notification',
    run: async (
      {
        subscriptionId,
        scheduledCancellationDate,
      }: {
        subscriptionId: string
        scheduledCancellationDate: number
      },
      { ctx }
    ) => {
      logger.log(
        'Sending customer subscription cancellation scheduled notification',
        {
          subscriptionId,
          scheduledCancellationDate,
          ctx,
        }
      )

      const { subscription, organization, customer } = (
        await adminTransaction(async ({ transaction }) => {
          const subscription = await selectSubscriptionById(
            subscriptionId,
            transaction
          )
          if (!subscription) {
            throw new Error(
              `Subscription not found: ${subscriptionId}`
            )
          }
          const organization = await selectOrganizationById(
            subscription.organizationId,
            transaction
          )
          const customer = await selectCustomerById(
            subscription.customerId,
            transaction
          )
          return {
            subscription,
            organization,
            customer,
          }
        })
      ).unwrap()

      if (!organization) {
        throw new Error(
          `Organization not found for subscription: ${subscriptionId}`
        )
      }
      if (!customer) {
        throw new Error(
          `Customer not found for subscription: ${subscriptionId}`
        )
      }

      // Validate customer email
      if (!customer.email || customer.email.trim() === '') {
        logger.log(
          'Skipping customer subscription cancellation scheduled notification: customer email is missing or empty',
          {
            customerId: customer.id,
            subscriptionId: subscription.id,
          }
        )
        return {
          message:
            'Customer subscription cancellation scheduled notification skipped: customer email is missing or empty',
        }
      }

      const cancellationDate = new Date(scheduledCancellationDate)

      // Use safe fallback for subscription name
      const subscriptionName =
        subscription.name || 'your subscription'

      await safeSend({
        from: 'Flowglad <notifications@flowglad.com>',
        bcc: getBccForLivemode(subscription.livemode),
        to: customer.email,
        subject: formatEmailSubject(
          `Cancellation Scheduled: Your ${subscriptionName} subscription will be canceled on ${formatDate(cancellationDate)}`,
          subscription.livemode
        ),
        react: CustomerSubscriptionCancellationScheduledEmail({
          customerName: customer.name,
          organizationName: organization.name,
          organizationLogoUrl: organization.logoURL || undefined,
          organizationId: organization.id,
          customerId: customer.id,
          subscriptionName,
          scheduledCancellationDate: cancellationDate,
          livemode: subscription.livemode,
        }),
      })

      return {
        message:
          'Customer subscription cancellation scheduled notification sent successfully',
      }
    },
  })

export const idempotentSendCustomerSubscriptionCancellationScheduledNotification =
  testSafeTriggerInvoker(
    async (
      subscriptionId: string,
      scheduledCancellationDate: number
    ) => {
      await sendCustomerSubscriptionCancellationScheduledNotificationTask.trigger(
        {
          subscriptionId,
          scheduledCancellationDate,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-subscription-cancellation-scheduled-notification-${subscriptionId}-${scheduledCancellationDate}`
          ),
        }
      )
    }
  )
