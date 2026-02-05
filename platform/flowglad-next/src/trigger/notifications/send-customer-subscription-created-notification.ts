import { SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectProductById } from '@/db/tableMethods/productMethods'
import {
  CustomerSubscriptionCreatedEmail,
  type TrialInfo,
} from '@/email-templates/customer-subscription-created'
import { PaymentError, ValidationError } from '@/errors'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { getFromAddress } from '@/utils/email/fromAddress'
import { buildNotificationContext } from '@/utils/email/notificationContext'

/**
 * Core run function for send-customer-subscription-created-notification task.
 * Exported for testing purposes.
 */
export const runSendCustomerSubscriptionCreatedNotification =
  async (params: {
    customerId: string
    subscriptionId: string
    organizationId: string
  }) => {
    logger.log('Sending customer subscription created notification', {
      payload: params,
    })

    let dataResult: Result<
      {
        organization: Organization.Record
        customer: Customer.Record
        subscription: Subscription.Record
        price: Price.Record | null
        paymentMethod: PaymentMethod.Record | null
        product: Product.Record | null
      },
      NotFoundError | ValidationError
    >
    try {
      const data = (
        await adminTransaction(async ({ transaction }) => {
          const context = await buildNotificationContext(
            {
              organizationId: params.organizationId,
              customerId: params.customerId,
              subscriptionId: params.subscriptionId,
              include: ['price', 'defaultPaymentMethod'],
            },
            transaction
          )

          // Fetch the product associated with the price for user-friendly naming
          const product =
            context.price && Price.hasProductId(context.price)
              ? (
                  await selectProductById(
                    context.price.productId,
                    transaction
                  )
                ).unwrap()
              : null

          return Result.ok({
            ...context,
            product,
          })
        })
      ).unwrap()
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
    const {
      organization,
      customer,
      subscription,
      price,
      paymentMethod,
      product,
    } = dataResult.value

    if (!price) {
      return Result.err(
        new NotFoundError('Price', subscription.priceId ?? 'unknown')
      )
    }

    // Validate customer email - return ValidationError per PR spec
    if (!customer.email || customer.email.trim() === '') {
      logger.log(
        'Customer subscription created notification failed: customer email is missing or empty',
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
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: organization.name,
      }),
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(subjectLine, subscription.livemode),
      react: await CustomerSubscriptionCreatedEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerExternalId: customer.externalId,
        planName:
          subscription.name || product?.name || 'Subscription',
        price: price.unitPrice,
        currency: price.currency,
        interval: price.intervalUnit || undefined,
        nextBillingDate: nextBillingDate || undefined,
        paymentMethodLast4: (paymentMethod?.paymentMethodData as any)
          ?.last4,
        trial: trialInfo,
        dateConfirmed: subscription.createdAt
          ? new Date(subscription.createdAt)
          : new Date(),
        isComplimentary: subscription.doNotCharge ?? false,
      }),
    })

    if (result?.error) {
      logger.error(
        'Error sending customer subscription created email',
        {
          error: result.error,
        }
      )
      return Result.err(new PaymentError('Failed to send email'))
    }

    return Result.ok({
      message:
        'Customer subscription created notification sent successfully',
    })
  }

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
    logger.log('Task context', { ctx, attempt: ctx.attempt })
    return runSendCustomerSubscriptionCreatedNotification(payload)
  },
})

export const idempotentSendCustomerSubscriptionCreatedNotification =
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
