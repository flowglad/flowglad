import { logger, task } from '@trigger.dev/sdk'
import { Subscription } from '@/db/schema/subscriptions'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { CustomerSubscriptionCanceledEmail } from '@/email-templates/customer-subscription-canceled'
import { safeSend } from '@/utils/email'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'

const sendCustomerSubscriptionCanceledNotificationTask = task({
  id: 'send-customer-subscription-canceled-notification',
  run: async (
    {
      subscription,
    }: {
      subscription: Subscription.Record
    },
    { ctx }
  ) => {
    logger.log('Sending customer subscription canceled notification', {
      subscription,
      ctx,
    })

    const { organization, customer } = await adminTransaction(
      async ({ transaction }) => {
        const organization = await selectOrganizationById(
          subscription.organizationId,
          transaction
        )
        const customer = await selectCustomerById(
          subscription.customerId,
          transaction
        )
        return {
          organization,
          customer,
        }
      }
    )

    if (!organization || !customer) {
      throw new Error('Organization or customer not found')
    }

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      to: customer.email,
      subject: `Subscription Canceled: Your ${subscription.name} subscription has been canceled`,
      react: CustomerSubscriptionCanceledEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoUrl || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionName: subscription.name!,
        cancellationDate: new Date(
          subscription.cancelScheduledAt ||
            subscription.canceledAt ||
            Date.now()
        ),
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
  testSafeTriggerInvoker(async (subscription: Subscription.Record) => {
    await sendCustomerSubscriptionCanceledNotificationTask.trigger(
      {
        subscription,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-customer-subscription-canceled-notification-${subscription.id}`
        ),
      }
    )
  })
