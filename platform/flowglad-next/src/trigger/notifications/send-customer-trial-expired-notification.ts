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
import { CustomerTrialExpiredNoPaymentEmail } from '@/email-templates/customer-trial-expired-no-payment'
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

/**
 * Core run function for send-customer-trial-expired-notification task.
 * Exported for testing purposes.
 */
export const runSendCustomerTrialExpiredNotification =
  async (params: { subscriptionId: string }) => {
    logger.log('Sending customer trial expired notification', {
      payload: params,
    })

    let dataResult: Result<
      {
        organization: Organization.Record
        customer: Customer.Record
        subscription: Subscription.Record
        price: Price.Record | null
        product: Product.Record | null
      },
      NotFoundError | ValidationError
    >
    try {
      const data = await adminTransaction(async ({ transaction }) => {
        const subscription = await selectSubscriptionById(
          params.subscriptionId,
          transaction
        )
        if (!subscription) {
          throw new NotFoundError(
            'Subscription',
            params.subscriptionId
          )
        }

        const { organization, customer } =
          await buildNotificationContext(
            {
              organizationId: subscription.organizationId,
              customerId: subscription.customerId,
            },
            transaction
          )

        const price = subscription.priceId
          ? (
              await selectPriceById(subscription.priceId, transaction)
            ).unwrap()
          : null

        // Fetch the product associated with the price for user-friendly naming
        const product =
          price && Price.hasProductId(price)
            ? (
                await selectProductById(price.productId, transaction)
              ).unwrap()
            : null

        return {
          organization,
          customer,
          subscription,
          price,
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
    const { organization, customer, subscription, price, product } =
      dataResult.value

    // Validate customer email - return ValidationError per PR spec
    if (!customer.email || customer.email.trim() === '') {
      logger.log(
        'Customer trial expired notification failed: customer email is missing or empty',
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

    const result = await safeSend({
      from: getFromAddress({
        recipientType: 'customer',
        organizationName: organization.name,
      }),
      bcc: getBccForLivemode(subscription.livemode),
      to: [customer.email],
      subject: formatEmailSubject(
        'Action Required: Update Your Payment Method',
        subscription.livemode
      ),
      react: await CustomerTrialExpiredNoPaymentEmail({
        customerName: customer.name,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoURL || undefined,
        organizationId: organization.id,
        customerId: customer.id,
        productName:
          subscription.name || product?.name || 'your subscription',
        livemode: subscription.livemode,
      }),
    })

    if (result?.error) {
      logger.error('Error sending customer trial expired email', {
        error: result.error,
      })
      return Result.err(new PaymentError('Failed to send email'))
    }

    return Result.ok({
      message:
        'Customer trial expired notification sent successfully',
    })
  }

const sendCustomerTrialExpiredNotificationTask = task({
  id: 'send-customer-trial-expired-notification',
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  run: async (
    payload: {
      subscriptionId: string
    },
    { ctx }
  ) => {
    logger.log('Task context', { ctx, attempt: ctx.attempt })
    return runSendCustomerTrialExpiredNotification(payload)
  },
})

export const idempotentSendCustomerTrialExpiredNotification =
  testSafeTriggerInvoker(
    async (params: { subscriptionId: string }) => {
      await sendCustomerTrialExpiredNotificationTask.trigger(params, {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-customer-trial-expired-notification-${params.subscriptionId}`
        ),
      })
    }
  )
