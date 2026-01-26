import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { NotFoundError } from '@/db/tableUtils'
import { CustomerSubscriptionCanceledEmail } from '@/email-templates/customer-subscription-canceled'
import { ValidationError } from '@/errors'
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

/**
 * Core run function for send-customer-subscription-canceled-notification task.
 * Exported for testing purposes.
 */
export const runSendCustomerSubscriptionCanceledNotification =
  async (params: { subscriptionId: string }) => {
    const { subscriptionId } = params
    logger.log(
      'Sending customer subscription canceled notification',
      {
        subscriptionId,
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
        const subscriptionResult = await selectSubscriptionById(
          subscriptionId,
          transaction
        )
        if (Result.isError(subscriptionResult)) {
          throw subscriptionResult.error
        }
        const subscription = subscriptionResult.value

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
        'Customer subscription canceled notification failed: customer email is missing or empty',
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

    // Only send notification if subscription has a cancellation date
    if (!subscription.cancelScheduledAt && !subscription.canceledAt) {
      logger.log(
        'Skipping customer subscription canceled notification: subscription has no cancellation date',
        {
          customerId: customer.id,
          subscriptionId: subscription.id,
        }
      )
      return Result.ok({
        message:
          'Customer subscription canceled notification skipped: subscription has no cancellation date',
      })
    }

    // Compute cancellation date from available timestamps
    const cancellationDate =
      subscription.cancelScheduledAt ||
      subscription.canceledAt ||
      subscription.updatedAt

    if (!cancellationDate) {
      logger.log(
        'Skipping customer subscription canceled notification: unable to determine cancellation date',
        {
          customerId: customer.id,
          subscriptionId: subscription.id,
        }
      )
      return Result.ok({
        message:
          'Customer subscription canceled notification skipped: unable to determine cancellation date',
      })
    }

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
        `Subscription Canceled: Your ${subscriptionName} subscription has been canceled`,
        subscription.livemode
      ),
      react: await CustomerSubscriptionCanceledEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        subscriptionName,
        cancellationDate: new Date(cancellationDate),
        livemode: subscription.livemode,
      }),
    })

    return Result.ok({
      message:
        'Customer subscription canceled notification sent successfully',
    })
  }

const sendCustomerSubscriptionCanceledNotificationTask = task({
  id: 'send-customer-subscription-canceled-notification',
  run: async (
    payload: {
      subscriptionId: string
    },
    { ctx }
  ) => {
    logger.log('Task context', { ctx })
    return runSendCustomerSubscriptionCanceledNotification(payload)
  },
})

export const idempotentSendCustomerSubscriptionCanceledNotification =
  testSafeTriggerInvoker(async (subscriptionId: string) => {
    await sendCustomerSubscriptionCanceledNotificationTask.trigger(
      {
        subscriptionId,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-customer-subscription-canceled-notification-${subscriptionId}`
        ),
      }
    )
  })
