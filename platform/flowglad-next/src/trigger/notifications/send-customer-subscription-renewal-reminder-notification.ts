import { logger, task } from '@trigger.dev/sdk'
import { kebabCase } from 'change-case'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionRenewalReminderEmail } from '@/email-templates/customer-subscription-renewal-reminder'
import { CurrencyCode } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'

const sendCustomerSubscriptionRenewalReminderNotificationTask = task({
  id: 'send-customer-subscription-renewal-reminder-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: {
      subscriptionId: string
    },
    { ctx }
  ) => {
    logger.log(
      'Sending customer subscription renewal reminder notification',
      {
        payload,
        attempt: ctx.attempt,
      }
    )

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

    if (!subscription.currentBillingPeriodEnd) {
      logger.warn('Subscription has no billing period end date', {
        subscriptionId: subscription.id,
      })
      return {
        message:
          'Subscription has no billing period end date - skipping notification',
      }
    }

    // Calculate days until renewal
    const now = Date.now()
    const renewalDate = new Date(subscription.currentBillingPeriodEnd)
    const daysUntilRenewal = Math.ceil(
      (subscription.currentBillingPeriodEnd - now) /
        (1000 * 60 * 60 * 24)
    )

    const result = await safeSend({
      from: `${organization.name} Billing <${kebabCase(organization.name)}-notifications@flowglad.com>`,
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(
        'Your Subscription Renews Soon',
        subscription.livemode
      ),
      react: await CustomerSubscriptionRenewalReminderEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        planName:
          subscription.name || price?.name || 'your subscription',
        renewalDate,
        daysUntilRenewal,
        price: price?.unitPrice ?? 0,
        currency: price?.currency ?? CurrencyCode.USD,
        interval: price?.intervalUnit || undefined,
        livemode: subscription.livemode,
      }),
    })

    if (result?.error) {
      logger.error(
        'Error sending customer subscription renewal reminder email',
        {
          error: result.error,
        }
      )
      throw new Error('Failed to send email')
    }

    return {
      message:
        'Customer subscription renewal reminder notification sent successfully',
    }
  },
})

export const idempotentSendCustomerSubscriptionRenewalReminderNotification =
  testSafeTriggerInvoker(
    async (params: {
      subscriptionId: string
      daysUntilRenewal: number
    }) => {
      await sendCustomerSubscriptionRenewalReminderNotificationTask.trigger(
        { subscriptionId: params.subscriptionId },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-subscription-renewal-reminder-notification-${params.subscriptionId}-${params.daysUntilRenewal}`
          ),
        }
      )
    }
  )
