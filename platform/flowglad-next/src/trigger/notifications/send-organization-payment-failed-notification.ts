import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
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
import { filterEligibleRecipients } from '@/utils/notifications'

interface PaymentFailedNotificationData {
  organizationId: string
  customerId: string
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

    const { organization, customer, usersAndMemberships } = (
      await adminTransaction(async ({ transaction }) => {
        const organization = await selectOrganizationById(
          paymentData.organizationId,
          transaction
        )
        const customer = await selectCustomerById(
          paymentData.customerId,
          transaction
        )
        const usersAndMemberships =
          await selectMembershipsAndUsersByMembershipWhere(
            {
              organizationId: paymentData.organizationId,
            },
            transaction
          )
        return {
          organization,
          customer,
          usersAndMemberships,
        }
      })
    ).unwrap()

    if (!organization || !customer) {
      throw new Error('Organization or customer not found')
    }

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
      react: OrganizationPaymentFailedNotificationEmail({
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
            `send-organization-payment-failed-notification-${paymentData.customerId}-${paymentData.amount}-${Date.now()}`
          ),
        }
      )
    }
  )
