import type { Customer } from '@db-core/schema/customers'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import { Price } from '@db-core/schema/prices'
import { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { User } from '@db-core/schema/users'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { OrganizationSubscriptionCancellationScheduledNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import { ValidationError } from '@/errors'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { formatDate, isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'
import { filterEligibleRecipients } from '@/utils/notifications'

/**
 * Core run function for send-organization-subscription-cancellation-scheduled-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationSubscriptionCancellationScheduledNotification =
  async (params: {
    subscription: Subscription.Record
    scheduledCancellationDate: number
  }) => {
    const { subscription, scheduledCancellationDate } = params
    logger.log(
      'Sending organization subscription cancellation scheduled notification',
      {
        subscription,
        scheduledCancellationDate,
      }
    )

    let dataResult: Result<
      {
        organization: Organization.Record
        customer: Customer.Record
        usersAndMemberships: Array<{
          user: User.Record
          membership: Membership.Record
        }>
        product: Product.Record | null
      },
      NotFoundError | ValidationError
    >
    try {
      const data = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const context = await buildNotificationContext(
            {
              organizationId: subscription.organizationId,
              customerId: subscription.customerId,
              include: ['usersAndMemberships'],
            },
            transaction
          )

          // Fetch the product associated with the subscription for user-friendly naming
          // NotFoundError is caught and treated as non-fatal - we use fallbacks instead
          let price: Price.Record | null = null
          if (subscription.priceId) {
            const priceResult = await selectPriceById(
              subscription.priceId,
              transaction
            )
            if (Result.isOk(priceResult)) {
              price = priceResult.value
            } else {
              logger.warn(
                'Price not found for subscription, using fallbacks',
                {
                  priceId: subscription.priceId,
                  subscriptionId: subscription.id,
                }
              )
            }
          }

          let product: Product.Record | null = null
          if (price && Price.hasProductId(price)) {
            const productResult = await selectProductById(
              price.productId,
              transaction
            )
            if (Result.isOk(productResult)) {
              product = productResult.value
            } else {
              logger.warn(
                'Product not found for subscription, using fallbacks',
                {
                  productId: price.productId,
                  subscriptionId: subscription.id,
                }
              )
            }
          }

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
    const { organization, customer, usersAndMemberships, product } =
      dataResult.value

    const eligibleRecipients = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCancellationScheduled',
      subscription.livemode
    )

    if (eligibleRecipients.length === 0) {
      return Result.ok({
        message: 'No recipients opted in for this notification',
      })
    }

    const recipientEmails = eligibleRecipients
      .map(({ user }) => user.email)
      .filter(
        (email): email is string => !isNil(email) && email !== ''
      )

    if (recipientEmails.length === 0) {
      return Result.ok({
        message: 'No valid email addresses for eligible recipients',
      })
    }

    const cancellationDate = new Date(scheduledCancellationDate)
    const subscriptionName =
      subscription.name || product?.name || 'subscription'

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `Cancellation Scheduled: ${customer.name} scheduled cancellation for ${subscriptionName} on ${formatDate(cancellationDate)}`,
        subscription.livemode
      ),
      /**
       * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
       */
      react:
        await OrganizationSubscriptionCancellationScheduledNotificationEmail(
          {
            organizationName: organization.name,
            subscriptionName,
            customerId: customer.id,
            customerName: customer.name,
            customerEmail: customer.email,
            scheduledCancellationDate: cancellationDate,
            livemode: subscription.livemode,
          }
        ),
    })

    return Result.ok({
      message:
        'Organization subscription cancellation scheduled notification sent successfully',
    })
  }

const sendOrganizationSubscriptionCancellationScheduledNotificationTask =
  task({
    id: 'send-organization-subscription-cancellation-scheduled-notification',
    run: async (
      payload: {
        subscription: Subscription.Record
        scheduledCancellationDate: number
      },
      { ctx }
    ) => {
      logger.log('Task context', { ctx })
      return runSendOrganizationSubscriptionCancellationScheduledNotification(
        payload
      )
    },
  })

export const idempotentSendOrganizationSubscriptionCancellationScheduledNotification =
  async (
    subscription: Subscription.Record,
    scheduledCancellationDate: number
  ) => {
    await sendOrganizationSubscriptionCancellationScheduledNotificationTask.trigger(
      {
        subscription,
        scheduledCancellationDate,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-organization-subscription-cancellation-scheduled-notification-${subscription.id}-${scheduledCancellationDate}`
        ),
      }
    )
  }
