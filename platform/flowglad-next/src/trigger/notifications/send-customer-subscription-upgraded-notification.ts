import { SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { Subscription } from '@db-core/schema/subscriptions'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionUpgradedEmail } from '@/email-templates/customer-subscription-upgraded'
import { PaymentError, ValidationError } from '@/errors'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { formatEmailSubject, safeSend } from '@/utils/email'
import { getFromAddress } from '@/utils/email/fromAddress'
import { buildNotificationContext } from '@/utils/email/notificationContext'

/**
 * Core run function for send-customer-subscription-upgraded-notification task.
 * Exported for testing purposes.
 */
export const runSendCustomerSubscriptionUpgradedNotification =
  async (params: {
    customerId: string
    newSubscriptionId: string
    previousSubscriptionId: string
    organizationId: string
  }) => {
    logger.log(
      'Sending customer subscription upgraded notification',
      {
        payload: params,
      }
    )

    let dataResult: Result<
      {
        organization: Organization.Record
        customer: Customer.Record
        newSubscription: Subscription.Record
        newPrice: Price.Record | null
        previousSubscription: Subscription.Record
        previousPrice: Price.Record | null
        paymentMethod: PaymentMethod.Record | null
      },
      NotFoundError | ValidationError
    >
    try {
      const data = (
        await adminTransaction(async ({ transaction }) => {
          // Use buildNotificationContext for new subscription context
          const {
            organization,
            customer,
            subscription: newSubscription,
            price: newPrice,
            paymentMethod,
          } = await buildNotificationContext(
            {
              organizationId: params.organizationId,
              customerId: params.customerId,
              subscriptionId: params.newSubscriptionId,
              include: ['price', 'defaultPaymentMethod'],
            },
            transaction
          )

          // Fetch previous subscription separately (not supported by buildNotificationContext)
          const previousSubscription = (
            await selectSubscriptionById(
              params.previousSubscriptionId,
              transaction
            )
          ).unwrap()

          const previousPrice = previousSubscription.priceId
            ? (
                await selectPriceById(
                  previousSubscription.priceId,
                  transaction
                )
              ).unwrap()
            : null

          return Result.ok({
            organization,
            customer,
            newSubscription,
            newPrice,
            previousSubscription,
            previousPrice,
            paymentMethod,
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
      newSubscription,
      newPrice,
      previousSubscription,
      previousPrice,
      paymentMethod,
    } = dataResult.value

    if (!newPrice) {
      return Result.err(
        new NotFoundError(
          'Price',
          newSubscription.priceId ?? 'unknown'
        )
      )
    }
    if (!previousPrice) {
      return Result.err(
        new NotFoundError(
          'Price',
          previousSubscription.priceId ?? 'unknown'
        )
      )
    }

    // Validate customer email - return ValidationError per PR spec
    if (!customer.email || customer.email.trim() === '') {
      logger.log(
        'Customer subscription upgraded notification failed: customer email is missing or empty',
        {
          customerId: customer.id,
          subscriptionId: newSubscription.id,
        }
      )
      return Result.err(
        new ValidationError(
          'email',
          'customer email is missing or empty'
        )
      )
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
        previousPlanName: previousSubscription.name || 'Free Plan',
        previousPlanPrice: previousPrice.unitPrice,
        previousPlanCurrency: previousPrice.currency,
        previousPlanInterval: previousPrice.intervalUnit || undefined,
        newPlanName: newSubscription.name || 'Subscription',
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
      return Result.err(new PaymentError('Failed to send email'))
    }

    return Result.ok({
      message:
        'Customer subscription upgraded notification sent successfully',
    })
  }

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
    logger.log('Task context', { ctx, attempt: ctx.attempt })
    return runSendCustomerSubscriptionUpgradedNotification(payload)
  },
})

export const idempotentSendCustomerSubscriptionUpgradedNotification =
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
