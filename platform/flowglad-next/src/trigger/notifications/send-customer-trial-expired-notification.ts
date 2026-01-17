import { logger, task } from '@trigger.dev/sdk'
import { kebabCase } from 'change-case'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerTrialExpiredNoPaymentEmail } from '@/email-templates/customer-trial-expired-no-payment'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'

const sendCustomerTrialExpiredNotificationTask = task({
  id: 'send-customer-trial-expired-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: {
      subscriptionId: string
    },
    { ctx }
  ) => {
    logger.log('Sending customer trial expired notification', {
      payload,
      attempt: ctx.attempt,
    })

    const { organization, customer, subscription, price } =
      await adminTransaction(async ({ transaction }) => {
        const subscription = await selectSubscriptionById(
          payload.subscriptionId,
          transaction
        )
        const organization = await selectOrganizationById(
          subscription.organizationId,
          transaction
        )
        const customer = await selectCustomerById(
          subscription.customerId,
          transaction
        )
        const price = subscription.priceId
          ? await selectPriceById(subscription.priceId, transaction)
          : null

        return {
          organization,
          customer,
          subscription,
          price,
        }
      })

    if (!organization || !customer || !subscription) {
      throw new Error('Required data not found')
    }

    if (!customer.email) {
      logger.warn('Customer has no email address', {
        customerId: customer.id,
      })
      return {
        message:
          'Customer has no email address - skipping notification',
      }
    }

    const result = await safeSend({
      from: `${organization.name} Billing <${kebabCase(organization.name)}-notifications@flowglad.com>`,
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(
        'Action Required: Update Your Payment Method',
        subscription.livemode
      ),
      react: await CustomerTrialExpiredNoPaymentEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        planName:
          subscription.name || price?.name || 'your subscription',
        livemode: subscription.livemode,
      }),
    })

    if (result?.error) {
      logger.error('Error sending customer trial expired email', {
        error: result.error,
      })
      throw new Error('Failed to send email')
    }

    return {
      message:
        'Customer trial expired notification sent successfully',
    }
  },
})

export const idempotentSendCustomerTrialExpiredNotification =
  testSafeTriggerInvoker(
    async (params: { subscriptionId: string }) => {
      await sendCustomerTrialExpiredNotificationTask.trigger(params, {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-customer-trial-expired-notification-${params.subscriptionId}`
        ),
      })
    }
  )
