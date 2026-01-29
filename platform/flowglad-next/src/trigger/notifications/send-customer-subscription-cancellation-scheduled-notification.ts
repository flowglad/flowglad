import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { CustomerSubscriptionCancellationScheduledEmail } from '@/email-templates/customer-subscription-cancellation-scheduled'
import { ValidationError } from '@/errors'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { formatDate } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { getFromAddress } from '@/utils/email/fromAddress'
import { buildNotificationContext } from '@/utils/email/notificationContext'

/**
 * Core run function for send-customer-subscription-cancellation-scheduled-notification task.
 * Exported for testing purposes.
 */
export const runSendCustomerSubscriptionCancellationScheduledNotification =
  async (params: {
    subscriptionId: string
    scheduledCancellationDate: number
  }) => {
    const { subscriptionId, scheduledCancellationDate } = params
    logger.log(
      'Sending customer subscription cancellation scheduled notification',
      {
        subscriptionId,
        scheduledCancellationDate,
      }
    )

    let dataResult: Result<
      {
        subscription: Subscription.Record
        organization: Organization.Record
        customer: Customer.Record
        product: Product.Record | null
      },
      NotFoundError | ValidationError
    >
    try {
      const data = await adminTransaction(async ({ transaction }) => {
        // First fetch subscription to get organizationId and customerId
        const subscription = (
          await selectSubscriptionById(subscriptionId, transaction)
        ).unwrap()

        // Use buildNotificationContext for organization and customer
        const { organization, customer } =
          await buildNotificationContext(
            {
              organizationId: subscription.organizationId,
              customerId: subscription.customerId,
            },
            transaction
          )

        // Fetch the product associated with the subscription for user-friendly naming
        const price = subscription.priceId
          ? (
              await selectPriceById(subscription.priceId, transaction)
            ).unwrap()
          : null
        const product =
          price && Price.hasProductId(price)
            ? (
                await selectProductById(price.productId, transaction)
              ).unwrap()
            : null

        return {
          subscription,
          organization,
          customer,
          product,
        }
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
    const { subscription, organization, customer, product } =
      dataResult.value

    // Validate customer email - return ValidationError per PR spec
    if (!customer.email || customer.email.trim() === '') {
      logger.log(
        'Customer subscription cancellation scheduled notification failed: customer email is missing or empty',
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

    const cancellationDate = new Date(scheduledCancellationDate)

    // Use safe fallback for subscription name
    const subscriptionName =
      subscription.name || product?.name || 'your subscription'

    await safeSend({
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: organization.name,
      }),
      bcc: getBccForLivemode(subscription.livemode),
      to: customer.email,
      subject: formatEmailSubject(
        `Cancellation Scheduled: Your ${subscriptionName} subscription will be canceled on ${formatDate(cancellationDate)}`,
        subscription.livemode
      ),
      react: CustomerSubscriptionCancellationScheduledEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionName,
        scheduledCancellationDate: cancellationDate,
        livemode: subscription.livemode,
      }),
    })

    return Result.ok({
      message:
        'Customer subscription cancellation scheduled notification sent successfully',
    })
  }

const sendCustomerSubscriptionCancellationScheduledNotificationTask =
  task({
    id: 'send-customer-subscription-cancellation-scheduled-notification',
    run: async (
      payload: {
        subscriptionId: string
        scheduledCancellationDate: number
      },
      { ctx }
    ) => {
      logger.log('Task context', { ctx })
      return runSendCustomerSubscriptionCancellationScheduledNotification(
        payload
      )
    },
  })

export const idempotentSendCustomerSubscriptionCancellationScheduledNotification =
  testSafeTriggerInvoker(
    async (
      subscriptionId: string,
      scheduledCancellationDate: number
    ) => {
      await sendCustomerSubscriptionCancellationScheduledNotificationTask.trigger(
        {
          subscriptionId,
          scheduledCancellationDate,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-customer-subscription-cancellation-scheduled-notification-${subscriptionId}-${scheduledCancellationDate}`
          ),
        }
      )
    }
  )
