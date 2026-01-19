import { logger, task } from '@trigger.dev/sdk'
import { kebabCase } from 'change-case'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionAdjustedEmail } from '@/email-templates/customer-subscription-adjusted'
import type { IntervalUnit } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'

interface SubscriptionItemPayload {
  name: string
  unitPrice: number
  quantity: number
}

export interface SendCustomerSubscriptionAdjustedNotificationPayload {
  subscriptionId: string
  customerId: string
  organizationId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: SubscriptionItemPayload[]
  newItems: SubscriptionItemPayload[]
  prorationAmount: number | null
  effectiveDate: number // timestamp in ms
}

const sendCustomerSubscriptionAdjustedNotificationTask = task({
  id: 'send-customer-subscription-adjusted-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: SendCustomerSubscriptionAdjustedNotificationPayload,
    { ctx }
  ) => {
    logger.log(
      'Sending customer subscription adjusted notification',
      {
        payload,
        attempt: ctx.attempt,
      }
    )

    const { organization, customer, subscription, price } = (
      await adminTransaction(async ({ transaction }) => {
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
        const price = subscription?.priceId
          ? await selectPriceById(subscription.priceId, transaction)
          : null

        return {
          organization,
          customer,
          subscription,
          price,
        }
      })
    ).unwrap()

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

    // Calculate totals from items
    const previousTotalPrice = payload.previousItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )
    const newTotalPrice = payload.newItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )

    // Get next billing date from subscription's current period end
    const nextBillingDate = subscription.currentBillingPeriodEnd
      ? new Date(subscription.currentBillingPeriodEnd)
      : undefined

    // Unified subject line for all Paid → Paid adjustments (regardless of direction)
    // per Apple-inspired patterns in subscription-email-improvements.md
    const result = await safeSend({
      from: `${organization.name} Billing <${kebabCase(organization.name)}-notifications@flowglad.com>`,
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(
        'Your Subscription has been Updated',
        subscription.livemode
      ),
      react: await CustomerSubscriptionAdjustedEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        adjustmentType: payload.adjustmentType,
        previousItems: payload.previousItems,
        newItems: payload.newItems,
        previousTotalPrice,
        newTotalPrice,
        currency: price.currency,
        interval: subscription.interval ?? undefined,
        prorationAmount: payload.prorationAmount,
        effectiveDate: new Date(payload.effectiveDate),
        nextBillingDate,
      }),
    })

    if (result?.error) {
      logger.error(
        'Error sending customer subscription adjusted email',
        {
          error: result.error,
        }
      )
      throw new Error('Failed to send email')
    }

    return {
      message:
        'Customer subscription adjusted notification sent successfully',
    }
  },
})

export const idempotentSendCustomerSubscriptionAdjustedNotification =
  testSafeTriggerInvoker(
    async (
      params: SendCustomerSubscriptionAdjustedNotificationPayload
    ) => {
      await sendCustomerSubscriptionAdjustedNotificationTask.trigger(
        params,
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-subscription-adjusted-notification-${params.subscriptionId}-${params.effectiveDate}`
          ),
        }
      )
    }
  )
