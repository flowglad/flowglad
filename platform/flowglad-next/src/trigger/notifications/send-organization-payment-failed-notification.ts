import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import { NotFoundError } from '@/db/tableUtils'
import { OrganizationPaymentFailedNotificationEmail } from '@/email-templates/organization/organization-payment-failed'
import { ValidationError } from '@/errors'
import type { CurrencyCode } from '@/types'
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

interface PaymentFailedNotificationData {
  organizationId: string
  customerId: string
  paymentId: string
  amount: number
  currency: CurrencyCode
  invoiceNumber?: string
  failureReason?: string
  livemode: boolean
}

/**
 * Core run function for send-organization-payment-failed-notification task.
 * Exported for testing purposes.
 */
export const runSendOrganizationPaymentFailedNotification = async (
  paymentData: PaymentFailedNotificationData
) => {
  logger.log('Sending organization payment failed notification', {
    paymentData,
  })

  let dataResult: Result<
    {
      organization: Organization.Record
      customer: Customer.Record
      usersAndMemberships: Array<{
        user: User.Record
        membership: Membership.Record
      }>
    },
    NotFoundError | ValidationError
  >
  try {
    const data = await adminTransaction(async ({ transaction }) => {
      return buildNotificationContext(
        {
          organizationId: paymentData.organizationId,
          customerId: paymentData.customerId,
          include: ['usersAndMemberships'],
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
  const { organization, customer, usersAndMemberships } =
    dataResult.value

  const eligibleRecipients = filterEligibleRecipients(
    usersAndMemberships,
    'paymentFailed',
    paymentData.livemode
  )

  if (eligibleRecipients.length === 0) {
    return Result.ok({
      message: 'No recipients opted in for this notification',
    })
  }

  const recipientEmails = eligibleRecipients
    .map(({ user }) => user.email)
    .filter((email): email is string => !isNil(email) && email !== '')

  if (recipientEmails.length === 0) {
    return Result.ok({
      message: 'No valid email addresses for eligible recipients',
    })
  }

  await safeSend({
    from: 'Flowglad <notifications@flowglad.com>',
    bcc: getBccForLivemode(paymentData.livemode),
    to: recipientEmails,
    subject: formatEmailSubject(
      `Payment Failed from ${customer.name}`,
      paymentData.livemode
    ),
    react: await OrganizationPaymentFailedNotificationEmail({
      organizationName: organization.name,
      amount: paymentData.amount,
      currency: paymentData.currency,
      invoiceNumber: paymentData.invoiceNumber,
      customerId: customer.id,
      customerName: customer.name,
      failureReason: paymentData.failureReason,
      livemode: paymentData.livemode,
    }),
  })

  return Result.ok({
    message:
      'Organization payment failed notification sent successfully',
  })
}

const sendOrganizationPaymentFailedNotificationTask = task({
  id: 'send-organization-payment-failed-notification',
  run: async (
    {
      paymentData,
    }: {
      paymentData: PaymentFailedNotificationData
    },
    { ctx }
  ) => {
    logger.log('Task context', { ctx })
    return runSendOrganizationPaymentFailedNotification(paymentData)
  },
})

export const idempotentSendOrganizationPaymentFailedNotification =
  testSafeTriggerInvoker(
    async (paymentData: PaymentFailedNotificationData) => {
      await sendOrganizationPaymentFailedNotificationTask.trigger(
        {
          paymentData,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-payment-failed-notification-${paymentData.paymentId}`
          ),
        }
      )
    }
  )
