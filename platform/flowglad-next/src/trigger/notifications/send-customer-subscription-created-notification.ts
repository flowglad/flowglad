import { logger, task } from '@trigger.dev/sdk'
import { kebabCase } from 'change-case'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  CustomerSubscriptionCreatedEmail,
  type TrialInfo,
} from '@/email-templates/customer-subscription-created'
import { SubscriptionStatus } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'

const sendCustomerSubscriptionCreatedNotificationTask = task({
  id: 'send-customer-subscription-created-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: {
      customerId: string
      subscriptionId: string
      organizationId: string
    },
    { ctx }
  ) => {
    logger.log('Sending customer subscription created notification', {
      payload,
      attempt: ctx.attempt,
    })

    const {
      organization,
      customer,
      subscription,
      price,
      paymentMethod,
    } = await adminTransaction(async ({ transaction }) => {
      const organization = await selectOrganizationById(
        payload.organizationId,
        transaction
      )
      const customer = await selectCustomerById(
        payload.customerId,
        transaction
      )
      const subscription = await selectSubscriptionById(
        payload.subscriptionId,
        transaction
      )
      const price = subscription.priceId
        ? await selectPriceById(subscription.priceId, transaction)
        : null
      const paymentMethods = await selectPaymentMethods(
        { customerId: payload.customerId },
        transaction
      )
      const paymentMethod =
        paymentMethods.find((pm) => pm.default) || paymentMethods[0]

      return {
        organization,
        customer,
        subscription,
        price,
        paymentMethod,
      }
    })

    if (!organization || !customer || !subscription || !price) {
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

    // Determine if this is a trial subscription with payment method
    const isTrialWithPaymentMethod =
      subscription.status === SubscriptionStatus.Trialing &&
      subscription.trialEnd &&
      (subscription.defaultPaymentMethodId ||
        subscription.backupPaymentMethodId ||
        paymentMethod)

    // Calculate trial info if this is a trial subscription
    let trialInfo: TrialInfo | undefined
    if (isTrialWithPaymentMethod && subscription.trialEnd) {
      const trialStartDate = subscription.createdAt
        ? new Date(subscription.createdAt)
        : new Date()
      const trialEndDate = new Date(subscription.trialEnd)
      const trialDurationMs =
        trialEndDate.getTime() - trialStartDate.getTime()
      const trialDurationDays = Math.ceil(
        trialDurationMs / (1000 * 60 * 60 * 24)
      )
      trialInfo = {
        trialEndDate,
        trialDurationDays,
      }
    }

    // Calculate next billing date based on subscription start and interval
    let nextBillingDate: Date | undefined
    if (price.intervalUnit) {
      nextBillingDate = new Date(subscription.createdAt!)
      const intervalCount = price.intervalCount || 1
      if (subscription.status === SubscriptionStatus.Trialing) {
        nextBillingDate = new Date(subscription.trialEnd!)
      } else {
        switch (price.intervalUnit) {
          case 'day':
            nextBillingDate.setDate(
              nextBillingDate.getDate() + intervalCount
            )
            break
          case 'week':
            nextBillingDate.setDate(
              nextBillingDate.getDate() + intervalCount * 7
            )
            break
          case 'month':
            nextBillingDate.setMonth(
              nextBillingDate.getMonth() + intervalCount
            )
            break
          case 'year':
            nextBillingDate.setFullYear(
              nextBillingDate.getFullYear() + intervalCount
            )
            break
        }
      }
    }

    // Unified subject line for all subscription confirmations (trial and non-trial)
    // per Apple-inspired patterns in subscription-email-improvements.md
    const subjectLine = 'Your Subscription is Confirmed'

    const result = await safeSend({
      from: `${organization.name} Billing <${kebabCase(organization.name)}-notifications@flowglad.com>`,
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(subjectLine, subscription.livemode),
      react: await CustomerSubscriptionCreatedEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerExternalId: customer.externalId,
        planName: subscription.name || price.name || 'Subscription',
        price: price.unitPrice,
        currency: price.currency,
        interval: price.intervalUnit || undefined,
        nextBillingDate: nextBillingDate || undefined,
        paymentMethodLast4: (paymentMethod?.paymentMethodData as any)
          ?.last4,
        trial: trialInfo,
      }),
    })

    if (result?.error) {
      logger.error(
        'Error sending customer subscription created email',
        {
          error: result.error,
        }
      )
      throw new Error('Failed to send email')
    }

    return {
      message:
        'Customer subscription created notification sent successfully',
    }
  },
})

export const idempotentSendCustomerSubscriptionCreatedNotification =
  testSafeTriggerInvoker(
    async (params: {
      customerId: string
      subscriptionId: string
      organizationId: string
    }) => {
      await sendCustomerSubscriptionCreatedNotificationTask.trigger(
        params,
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-subscription-created-notification-${params.subscriptionId}`
          ),
        }
      )
    }
  )
