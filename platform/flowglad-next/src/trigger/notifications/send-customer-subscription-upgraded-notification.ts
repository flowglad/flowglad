import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionUpgradedEmail } from '@/email-templates/customer-subscription-upgraded'
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
import { getFromAddress } from '@/utils/email/fromAddress'
import { buildNotificationContext } from '@/utils/email/notificationContext'

const sendCustomerSubscriptionUpgradedNotificationTask = task({
  id: 'send-customer-subscription-upgraded-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: {
      customerId: string
      newSubscriptionId: string
      previousSubscriptionId: string
      organizationId: string
    },
    { ctx }
  ) => {
    logger.log(
      'Sending customer subscription upgraded notification',
      {
        payload,
        attempt: ctx.attempt,
      }
    )

    const {
      organization,
      customer,
      newSubscription,
      newPrice,
      previousSubscription,
      previousPrice,
      paymentMethod,
    } = await adminTransaction(async ({ transaction }) => {
      // Use buildNotificationContext for new subscription context
      const {
        organization,
        customer,
        subscription: newSubscription,
        price: newPrice,
        paymentMethod,
      } = await buildNotificationContext(
        {
          organizationId: payload.organizationId,
          customerId: payload.customerId,
          subscriptionId: payload.newSubscriptionId,
          include: ['price', 'defaultPaymentMethod'],
        },
        transaction
      )

      // Fetch previous subscription separately (not supported by buildNotificationContext)
      const previousSubscription = await selectSubscriptionById(
        payload.previousSubscriptionId,
        transaction
      )
      if (!previousSubscription) {
        throw new Error(
          `Previous subscription not found: ${payload.previousSubscriptionId}`
        )
      }

      const previousPrice = previousSubscription.priceId
        ? await selectPriceById(
            previousSubscription.priceId,
            transaction
          )
        : null

      return {
        organization,
        customer,
        newSubscription,
        newPrice,
        previousSubscription,
        previousPrice,
        paymentMethod,
      }
    })

    if (!newPrice || !previousPrice) {
      throw new Error('Price not found for subscriptions')
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

    // Calculate next billing date based on new subscription start and interval
    let nextBillingDate: Date | undefined
    let trialing = false
    if (newPrice.intervalUnit) {
      nextBillingDate = new Date(newSubscription.createdAt!)
      const intervalCount = newPrice.intervalCount || 1
      if (newSubscription.status === SubscriptionStatus.Trialing) {
        nextBillingDate = new Date(newSubscription.trialEnd!)
        trialing = true
      } else {
        switch (newPrice.intervalUnit) {
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
    // Unified subject line for Free → Paid upgrades (first-time paid subscription)
    // per Apple-inspired patterns in subscription-email-improvements.md
    const result = await safeSend({
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: organization.name,
      }),
      bcc: getBccForLivemode(newSubscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(
        'Your Subscription is Confirmed',
        newSubscription.livemode
      ),
      react: await CustomerSubscriptionUpgradedEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerExternalId: customer.externalId,
        previousPlanName:
          previousSubscription.name ||
          previousPrice.name ||
          'Free Plan',
        previousPlanPrice: previousPrice.unitPrice,
        previousPlanCurrency: previousPrice.currency,
        previousPlanInterval: previousPrice.intervalUnit || undefined,
        newPlanName:
          newSubscription.name || newPrice.name || 'Subscription',
        price: newPrice.unitPrice,
        currency: newPrice.currency,
        interval: newPrice.intervalUnit || undefined,
        nextBillingDate: nextBillingDate || undefined,
        paymentMethodLast4: (paymentMethod?.paymentMethodData as any)
          ?.last4,
        trialing,
        dateConfirmed: newSubscription.createdAt
          ? new Date(newSubscription.createdAt)
          : new Date(),
      }),
    })

    if (result?.error) {
      logger.error(
        'Error sending customer subscription upgraded email',
        {
          error: result.error,
        }
      )
      throw new Error('Failed to send email')
    }

    return {
      message:
        'Customer subscription upgraded notification sent successfully',
    }
  },
})

export const idempotentSendCustomerSubscriptionUpgradedNotification =
  testSafeTriggerInvoker(
    async (params: {
      customerId: string
      newSubscriptionId: string
      previousSubscriptionId: string
      organizationId: string
    }) => {
      await sendCustomerSubscriptionUpgradedNotificationTask.trigger(
        params,
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-subscription-upgraded-notification-${params.newSubscriptionId}-${params.previousSubscriptionId}`
          ),
        }
      )
    }
  )
