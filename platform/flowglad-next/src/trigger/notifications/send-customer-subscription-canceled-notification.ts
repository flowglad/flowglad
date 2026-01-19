import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionCanceledEmail } from '@/email-templates/customer-subscription-canceled'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { getFromAddress } from '@/utils/email/fromAddress'

const sendCustomerSubscriptionCanceledNotificationTask = task({
  id: 'send-customer-subscription-canceled-notification',
  run: async (
    {
      subscriptionId,
    }: {
      subscriptionId: string
    },
    { ctx }
  ) => {
    logger.log(
      'Sending customer subscription canceled notification',
      {
        subscriptionId,
        ctx,
      }
    )

    const { subscription, organization, customer } =
      await adminTransaction(async ({ transaction }) => {
        const subscription = await selectSubscriptionById(
          subscriptionId,
          transaction
        )
        if (!subscription) {
          throw new Error(`Subscription not found: ${subscriptionId}`)
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

    if (!organization || !customer) {
      throw new Error('Organization or customer not found')
    }

    // Validate customer email
    if (!customer.email || customer.email.trim() === '') {
      logger.log(
        'Skipping customer subscription canceled notification: customer email is missing or empty',
        {
          customerId: customer.id,
          subscriptionId: subscription.id,
        }
      )
      return {
        message:
          'Customer subscription canceled notification skipped: customer email is missing or empty',
      }
    }

    // Only send notification if subscription has a cancellation date
    if (!subscription.cancelScheduledAt && !subscription.canceledAt) {
      logger.log(
        'Skipping customer subscription canceled notification: subscription has no cancellation date',
        {
          customerId: customer.id,
          subscriptionId: subscription.id,
        }
      )
      return {
        message:
          'Customer subscription canceled notification skipped: subscription has no cancellation date',
      }
    }

    // Compute cancellation date from available timestamps
    const cancellationDate =
      subscription.cancelScheduledAt ||
      subscription.canceledAt ||
      subscription.updatedAt

    if (!cancellationDate) {
      logger.log(
        'Skipping customer subscription canceled notification: unable to determine cancellation date',
        {
          customerId: customer.id,
          subscriptionId: subscription.id,
        }
      )
      return {
        message:
          'Customer subscription canceled notification skipped: unable to determine cancellation date',
      }
    }

    // Use safe fallback for subscription name
    const subscriptionName = subscription.name || 'your subscription'

    await safeSend({
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: organization.name,
      }),
      bcc: getBccForLivemode(subscription.livemode),
      to: customer.email,
      subject: formatEmailSubject(
        `Subscription Canceled: Your ${subscriptionName} subscription has been canceled`,
        subscription.livemode
      ),
      react: await CustomerSubscriptionCanceledEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionName,
        cancellationDate: new Date(cancellationDate),
        livemode: subscription.livemode,
      }),
    })

    return {
      message:
        'Customer subscription canceled notification sent successfully',
    }
  },
})

export const idempotentSendCustomerSubscriptionCanceledNotification =
  testSafeTriggerInvoker(async (subscriptionId: string) => {
    await sendCustomerSubscriptionCanceledNotificationTask.trigger(
      {
        subscriptionId,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-customer-subscription-canceled-notification-${subscriptionId}`
        ),
      }
    )
  })
