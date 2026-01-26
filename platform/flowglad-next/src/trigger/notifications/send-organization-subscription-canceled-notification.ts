import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { NotFoundError } from '@/db/tableUtils'
import { OrganizationSubscriptionCanceledNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import { ValidationError } from '@/errors'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'
import { filterEligibleRecipients } from '@/utils/notifications'

/**
 * Core run function for send-organization-subscription-canceled-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationSubscriptionCanceledNotification =
  async (params: { subscription: Subscription.Record }) => {
    const { subscription } = params
    logger.log(
      'Sending organization subscription canceled notification',
      {
        subscription,
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
      const data = await adminTransaction(async ({ transaction }) => {
        const context = await buildNotificationContext(
          {
            organizationId: subscription.organizationId,
            customerId: subscription.customerId,
            include: ['usersAndMemberships'],
          },
          transaction
        )

        // Fetch the product associated with the subscription for user-friendly naming.
        //
        // IMPORTANT: Price/Product lookups are treated as non-fatal because:
        // 1. The email only needs a friendly subscription name, which has fallbacks
        //    (subscription.name || product?.name || 'their subscription')
        // 2. A missing price/product record (e.g., deleted, orphaned data) should
        //    not prevent the cancellation notification from being sent
        // 3. We still want to log warnings for observability so orphaned data
        //    can be investigated if it becomes a pattern
        //
        // Only NotFoundError is caught; other errors (DB failures, etc.) are
        // re-thrown to allow Trigger.dev to retry the task.
        let price: Price.Record | null = null
        if (subscription.priceId) {
          try {
            price = await selectPriceById(
              subscription.priceId,
              transaction
            )
          } catch (error) {
            if (error instanceof NotFoundError) {
              // Price was deleted or never existed - proceed with fallback name
              logger.warn(
                'Price not found for subscription, using fallbacks',
                {
                  priceId: subscription.priceId,
                  subscriptionId: subscription.id,
                }
              )
            } else {
              // Unexpected error (connection issue, etc.) - let Trigger.dev retry
              throw error
            }
          }
        }

        let product: Product.Record | null = null
        if (price && Price.hasProductId(price)) {
          try {
            product = await selectProductById(
              price.productId,
              transaction
            )
          } catch (error) {
            if (error instanceof NotFoundError) {
              // Product was deleted or never existed - proceed with fallback name
              logger.warn(
                'Product not found for subscription, using fallbacks',
                {
                  productId: price.productId,
                  subscriptionId: subscription.id,
                }
              )
            } else {
              // Unexpected error (connection issue, etc.) - let Trigger.dev retry
              throw error
            }
          }
        }

        return {
          ...context,
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
    const { organization, customer, usersAndMemberships, product } =
      dataResult.value

    const eligibleRecipients = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionCanceled',
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

    const subscriptionName =
      subscription.name || product?.name || 'their subscription'

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `Subscription Canceled: ${customer.name} canceled ${subscriptionName}`,
        subscription.livemode
      ),
      /**
       * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
       */
      react: await OrganizationSubscriptionCanceledNotificationEmail({
        organizationName: organization.name,
        subscriptionName,
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        cancellationDate: new Date(
          subscription.cancelScheduledAt ||
            subscription.canceledAt ||
            Date.now()
        ),
        livemode: subscription.livemode,
      }),
    })

    return Result.ok({
      message:
        'Organization subscription canceled notification sent successfully',
    })
  }

const sendOrganizationSubscriptionCanceledNotificationTask = task({
  id: 'send-organization-subscription-canceled-notification',
  run: async (
    payload: {
      subscription: Subscription.Record
    },
    { ctx }
  ) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationSubscriptionCanceledNotification(
      payload
    )
  },
})

export const idempotentSendOrganizationSubscriptionCanceledNotification =
  testSafeTriggerInvoker(
    async (subscription: Subscription.Record) => {
      await sendOrganizationSubscriptionCanceledNotificationTask.trigger(
        {
          subscription,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-subscription-canceled-notification-${subscription.id}`
          ),
        }
      )
    }
  )
