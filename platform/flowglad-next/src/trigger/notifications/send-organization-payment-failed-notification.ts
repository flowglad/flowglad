import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { OrganizationPaymentFailedNotificationEmail } from '@/email-templates/organization/organization-payment-failed'
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
  paymentId: string
  organizationId: string
  customerId: string
  paymentId: string
  amount: number
  currency: CurrencyCode
  invoiceNumber?: string
  failureReason?: string
  livemode: boolean
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
    logger.log('Sending organization payment failed notification', {
      paymentData,
      ctx,
    })

    const { organization, customer, usersAndMemberships } =
      await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: paymentData.organizationId,
            customerId: paymentData.customerId,
            include: ['usersAndMemberships'],
          },
          transaction
        )
      })

    const eligibleRecipients = filterEligibleRecipients(
      usersAndMemberships,
      'paymentFailed',
      paymentData.livemode
    )

    if (eligibleRecipients.length === 0) {
      return {
        message: 'No recipients opted in for this notification',
      }
    }

    const recipientEmails = eligibleRecipients
      .map(({ user }) => user.email)
      .filter(
        (email): email is string => !isNil(email) && email !== ''
      )

    if (recipientEmails.length === 0) {
      return {
        message: 'No valid email addresses for eligible recipients',
      }
    }

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      bcc: getBccForLivemode(paymentData.livemode),
      to: recipientEmails,
      subject: formatEmailSubject(
        `Payment Failed: ${customer.name} payment of ${paymentData.amount} ${paymentData.currency} failed`,
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

    return {
      message:
        'Organization payment failed notification sent successfully',
    }
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
