import type { Customer } from '@db-core/schema/customers'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { User } from '@db-core/schema/users'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectProductById } from '@/db/tableMethods/productMethods'
import { OrganizationSubscriptionCreatedNotificationEmail } from '@/email-templates/organization-subscription-notifications'
import { ValidationError } from '@/errors'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import {
  formatEmailSubject,
  getBccForLivemode,
  safeSend,
} from '@/utils/email'
import { buildNotificationContext } from '@/utils/email/notificationContext'
import { filterEligibleRecipients } from '@/utils/notifications'

/**
 * Core run function for send-organization-subscription-created-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationSubscriptionCreatedNotification =
  async (params: { subscription: Subscription.Record }) => {
    const { subscription } = params
    logger.log(
      'Sending organization subscription created notification',
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
      'subscriptionCreated',
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
      subscription.name || product?.name || 'a plan'

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `New Subscription: ${customer.name} subscribed to ${subscriptionName}`,
        subscription.livemode
      ),
      /**
       * NOTE: await needed to prevent React 18 renderToPipeableStream error when used with Resend
       */
      react: await OrganizationSubscriptionCreatedNotificationEmail({
        organizationName: organization.name,
        subscriptionName,
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        livemode: subscription.livemode,
      }),
    })

    return Result.ok({
      message:
        'Organization subscription created notification sent successfully',
    })
  }

const sendOrganizationSubscriptionCreatedNotificationTask = task({
  id: 'send-organization-subscription-created-notification',
  run: async (
    payload: {
      subscription: Subscription.Record
    },
    { ctx }
  ) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationSubscriptionCreatedNotification(payload)
  },
})

export const idempotentSendOrganizationSubscriptionCreatedNotification =
  async (subscription: Subscription.Record) => {
    await sendOrganizationSubscriptionCreatedNotificationTask.trigger(
      {
        subscription,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-organization-subscription-created-notification-${subscription.id}`
        ),
      }
    )
  }
