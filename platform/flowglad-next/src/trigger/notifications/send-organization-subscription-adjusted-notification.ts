import type { CurrencyCode } from '@db-core/enums'
import { NotFoundError } from '@db-core/tableUtils'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import {
  OrganizationSubscriptionAdjustedEmail,
  type SubscriptionItem,
} from '@/email-templates/organization/organization-subscription-adjusted'
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

export interface SendOrganizationSubscriptionAdjustedNotificationPayload {
  subscriptionId: string
  customerId: string
  organizationId: string
  adjustmentType: 'upgrade' | 'downgrade'
  previousItems: SubscriptionItem[]
  newItems: SubscriptionItem[]
  prorationAmount: number | null
  effectiveDate: number // timestamp
  currency: CurrencyCode
}

/**
 * Core run function for send-organization-subscription-adjusted-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationSubscriptionAdjustedNotification =
  async (
    payload: SendOrganizationSubscriptionAdjustedNotificationPayload
  ) => {
    logger.log(
      'Sending organization subscription adjusted notification',
      {
        payload,
      }
    )

    const {
      subscriptionId,
      customerId,
      organizationId,
      adjustmentType,
      previousItems,
      newItems,
      prorationAmount,
      effectiveDate,
      currency,
    } = payload

    let dataResult: Result<
      {
        organization: Organization.Record
        customer: Customer.Record
        subscription: Subscription.Record
        usersAndMemberships: Array<{
          user: User.Record
          membership: Membership.Record
        }>
      },
      NotFoundError | ValidationError
    >
    try {
      const data = await adminTransaction(async ({ transaction }) => {
        const [context, usersAndMemberships, subscriptionRecord] =
          await Promise.all([
            buildNotificationContext(
              {
                organizationId,
                customerId,
              },
              transaction
            ),
            selectMembershipsAndUsersByMembershipWhere(
              { organizationId },
              transaction
            ),
            selectSubscriptionById(subscriptionId, transaction).then(
              (r) => r.unwrap()
            ),
          ])

        return {
          ...context,
          subscription: subscriptionRecord,
          usersAndMemberships,
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
    const {
      organization,
      customer,
      subscription,
      usersAndMemberships,
    } = dataResult.value

    const eligibleRecipients = filterEligibleRecipients(
      usersAndMemberships,
      'subscriptionAdjusted',
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

    const previousTotalPrice = previousItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )
    const newTotalPrice = newItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )

    // Unified subject line with customer name for all adjustments
    // per Apple-inspired patterns in subscription-email-improvements.md
    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(subscription.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `Subscription Updated - ${customer.name || customer.email}`,
        subscription.livemode
      ),
      react: await OrganizationSubscriptionAdjustedEmail({
        organizationName: organization.name,
        customerName: customer.name,
        customerEmail: customer.email,
        customerId: customer.id,
        adjustmentType,
        previousItems,
        newItems,
        previousTotalPrice,
        newTotalPrice,
        currency,
        prorationAmount,
        effectiveDate: new Date(effectiveDate),
        livemode: subscription.livemode,
      }),
    })

    return Result.ok({
      message:
        'Organization subscription adjusted notification sent successfully',
    })
  }

const sendOrganizationSubscriptionAdjustedNotificationTask = task({
  id: 'send-organization-subscription-adjusted-notification',
  run: async (
    payload: SendOrganizationSubscriptionAdjustedNotificationPayload,
    { ctx }
  ) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationSubscriptionAdjustedNotification(
      payload
    )
  },
})

export const idempotentSendOrganizationSubscriptionAdjustedNotification =
  testSafeTriggerInvoker(
    async (
      params: SendOrganizationSubscriptionAdjustedNotificationPayload
    ) => {
      await sendOrganizationSubscriptionAdjustedNotificationTask.trigger(
        params,
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-subscription-adjusted-notification-${params.subscriptionId}-${params.effectiveDate}`
          ),
        }
      )
    }
  )
