import { logger, task } from '@trigger.dev/sdk'
import { kebabCase } from 'change-case'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerTrialEndingSoonEmail } from '@/email-templates/customer-trial-ending-soon'
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

const sendCustomerTrialEndingReminderNotificationTask = task({
  id: 'send-customer-trial-ending-reminder-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: {
      subscriptionId: string
    },
    { ctx }
  ) => {
    logger.log(
      'Sending customer trial ending reminder notification',
      {
        payload,
        attempt: ctx.attempt,
      }
    )

    const {
      organization,
      customer,
      subscription,
      price,
      hasPaymentMethod,
    } = await adminTransaction(async ({ transaction }) => {
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
      const paymentMethods = await selectPaymentMethods(
        { customerId: subscription.customerId },
        transaction
      )
      const hasPaymentMethod =
        !!subscription.defaultPaymentMethodId ||
        !!subscription.backupPaymentMethodId ||
        paymentMethods.length > 0

      return {
        organization,
        customer,
        subscription,
        price,
        hasPaymentMethod,
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

    if (!subscription.trialEnd) {
      logger.warn('Subscription has no trial end date', {
        subscriptionId: subscription.id,
      })
      return {
        message:
          'Subscription has no trial end date - skipping notification',
      }
    }

    // Calculate days remaining
    const now = Date.now()
    const trialEndDate = new Date(subscription.trialEnd)
    const daysRemaining = Math.ceil(
      (subscription.trialEnd - now) / (1000 * 60 * 60 * 24)
    )

    // Determine subject line
    const subjectLine =
      daysRemaining === 1
        ? 'Your Trial Ends Tomorrow'
        : `Your Trial Ends in ${daysRemaining} Days`

    const result = await safeSend({
      from: `${organization.name} Billing <${kebabCase(organization.name)}-notifications@flowglad.com>`,
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(subjectLine, subscription.livemode),
      react: await CustomerTrialEndingSoonEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        planName:
          subscription.name || price?.name || 'your subscription',
        trialEndDate,
        daysRemaining,
        price: price?.unitPrice ?? 0,
        currency: price?.currency ?? CurrencyCode.USD,
        interval: price?.intervalUnit || undefined,
        hasPaymentMethod,
        livemode: subscription.livemode,
      }),
    })

    if (result?.error) {
      logger.error(
        'Error sending customer trial ending reminder email',
        {
          error: result.error,
        }
      )
      throw new Error('Failed to send email')
    }

    return {
      message:
        'Customer trial ending reminder notification sent successfully',
    }
  },
})

export const idempotentSendCustomerTrialEndingReminderNotification =
  testSafeTriggerInvoker(
    async (params: {
      subscriptionId: string
      daysRemaining: number
    }) => {
      await sendCustomerTrialEndingReminderNotificationTask.trigger(
        { subscriptionId: params.subscriptionId },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-trial-ending-reminder-notification-${params.subscriptionId}-${params.daysRemaining}`
          ),
        }
      )
    }
  )
