import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import { CustomerSubscriptionAdjustedEmail } from '@/email-templates/customer-subscription-adjusted'
import { PaymentError, ValidationError } from '@/errors'
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

/**
 * Core run function for send-customer-subscription-adjusted-notification task.
 * Exported for testing purposes.
 */
export const runSendCustomerSubscriptionAdjustedNotification = async (
  payload: SendCustomerSubscriptionAdjustedNotificationPayload
) => {
  logger.log('Sending customer subscription adjusted notification', {
    payload,
  })

  let dataResult: Result<
    {
      organization: Organization.Record
      customer: Customer.Record
      subscription: Subscription.Record
      price: Price.Record | null
    },
    NotFoundError | ValidationError
  >
  try {
    const data = await adminTransaction(async ({ transaction }) => {
      return buildNotificationContext(
        {
          organizationId: payload.organizationId,
          customerId: payload.customerId,
          subscriptionId: payload.subscriptionId,
          include: ['price'],
        },
        transaction
      )
    })
    dataResult = Result.ok(data)
  } catch (error) {
    // Only convert NotFoundError to Result.err; rethrow other errors
    // for Trigger.dev to retry (e.g., transient DB failures)
    if (error instanceof NotFoundError) {
      dataResult = Result.err(error)
    } else if (
      error instanceof Error &&
      error.message.includes('not found')
    ) {
      // Handle errors from buildNotificationContext
      dataResult = Result.err(
        new NotFoundError('Resource', error.message)
      )
    } else {
      throw error
    }
  }

  if (Result.isError(dataResult)) {
    return dataResult
  }
  const { organization, customer, subscription, price } =
    dataResult.value

  if (!price) {
    return Result.err(
      new NotFoundError('Price', subscription.priceId ?? 'unknown')
    )
  }

  // Validate customer email - return ValidationError per PR spec
  if (!customer.email || customer.email.trim() === '') {
    logger.log(
      'Customer subscription adjusted notification failed: customer email is missing or empty',
      {
        customerId: customer.id,
        subscriptionId: subscription.id,
      }
    )
    return Result.err(
      new ValidationError(
        'email',
        'customer email is missing or empty'
      )
    )
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
    from: getFromAddress({
      recipientType: 'customer',
      organizationName: organization.name,
    }),
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
    return Result.err(new PaymentError('Failed to send email'))
  }

  return Result.ok({
    message:
      'Customer subscription adjusted notification sent successfully',
  })
}

const sendCustomerSubscriptionAdjustedNotificationTask = task({
  id: 'send-customer-subscription-adjusted-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: SendCustomerSubscriptionAdjustedNotificationPayload,
    { ctx }
  ) => {
    logger.log('Task context', { ctx, attempt: ctx.attempt })
    return runSendCustomerSubscriptionAdjustedNotification(payload)
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
