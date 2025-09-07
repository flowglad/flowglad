import core from '@/utils/core'
import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { CustomerSubscriptionUpgradedEmail } from '@/email-templates/customer-subscription-upgraded'
import { safeSend } from '@/utils/email'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { kebabCase } from 'change-case'

export const sendCustomerSubscriptionUpgradedNotificationTask = task({
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
        ctx,
      }
    )

    const {
      organization,
      customer,
      newSubscription,
      previousSubscription,
      newPrice,
      previousPrice,
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
      const newSubscription = await selectSubscriptionById(
        payload.newSubscriptionId,
        transaction
      )
      const previousSubscription = await selectSubscriptionById(
        payload.previousSubscriptionId,
        transaction
      )
      const newPrice = newSubscription.priceId
        ? await selectPriceById(newSubscription.priceId, transaction)
        : null
      const previousPrice = previousSubscription.priceId
        ? await selectPriceById(
            previousSubscription.priceId,
            transaction
          )
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
        newSubscription,
        previousSubscription,
        newPrice,
        previousPrice,
        paymentMethod,
      }
    })

    if (
      !organization ||
      !customer ||
      !newSubscription ||
      !newPrice ||
      !previousSubscription ||
      !previousPrice
    ) {
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

    // Calculate next billing date based on new subscription start and interval
    const nextBillingDate = new Date(newSubscription.createdAt!)
    if (newPrice.intervalUnit === 'month') {
      nextBillingDate.setMonth(
        nextBillingDate.getMonth() + (newPrice.intervalCount || 1)
      )
    } else if (newPrice.intervalUnit === 'year') {
      nextBillingDate.setFullYear(
        nextBillingDate.getFullYear() + (newPrice.intervalCount || 1)
      )
    }
    if (!newPrice.intervalUnit) {
      throw new Error('Price interval unit is required')
    }
    const result = await safeSend({
      from: `${organization.name} Billing <${kebabCase(organization.name)}-notifications@flowglad.com>`,
      bcc: [core.envVariable('NOTIF_UAT_EMAIL')],
      to: [customer.email],
      subject: 'Payment method confirmed - Subscription upgraded',
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
        previousPlanInterval: (previousPrice.intervalUnit ||
          'month') as 'month' | 'year',
        newPlanName:
          newSubscription.name || newPrice.name || 'Subscription',
        price: newPrice.unitPrice,
        currency: newPrice.currency,
        interval: newPrice.intervalUnit,
        nextBillingDate,
        paymentMethodLast4: (paymentMethod?.paymentMethodData as any)
          ?.last4,
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
