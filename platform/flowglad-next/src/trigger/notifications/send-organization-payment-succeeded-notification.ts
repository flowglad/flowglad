import type { CurrencyCode } from '@db-core/enums'
import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { createTriggerIdempotencyKey } from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import { sendOrganizationPaymentNotificationEmail } from '@/utils/email'
import { filterEligibleRecipients } from '@/utils/notifications'

interface PaymentSucceededNotificationData {
  organizationId: string
  customerId: string
  paymentId: string
  amount: number
  currency: CurrencyCode
  invoiceNumber?: string
  livemode: boolean
}

const sendOrganizationPaymentSucceededNotificationTask = task({
  id: 'send-organization-payment-succeeded-notification',
  run: async (
    {
      paymentData,
    }: {
      paymentData: PaymentSucceededNotificationData
    },
    { ctx }
  ) => {
    logger.log(
      'Sending organization payment succeeded notification',
      {
        paymentData,
        ctx,
      }
    )

    const { organization, customer, usersAndMemberships } = (
      await adminTransaction(async ({ transaction }) => {
        const organization = (
          await selectOrganizationById(
            paymentData.organizationId,
            transaction
          )
        ).unwrap()
        const customer = (
          await selectCustomerById(
            paymentData.customerId,
            transaction
          )
        ).unwrap()
        const usersAndMemberships =
          await selectMembershipsAndUsersByMembershipWhere(
            {
              organizationId: paymentData.organizationId,
            },
            transaction
          )
        return Result.ok({
          organization,
          customer,
          usersAndMemberships,
        })
      })
    ).unwrap()

    const eligibleRecipients = filterEligibleRecipients(
      usersAndMemberships,
      'paymentSuccessful',
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

    await sendOrganizationPaymentNotificationEmail({
      to: recipientEmails,
      organizationName: organization.name,
      amount: paymentData.amount,
      currency: paymentData.currency,
      invoiceNumber: paymentData.invoiceNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      livemode: paymentData.livemode,
    })

    return {
      message:
        'Organization payment succeeded notification sent successfully',
    }
  },
})

export const sendOrganizationPaymentSucceededNotificationIdempotently =
  async (paymentData: PaymentSucceededNotificationData) => {
    await sendOrganizationPaymentSucceededNotificationTask.trigger(
      {
        paymentData,
      },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-organization-payment-succeeded-notification-${paymentData.paymentId}`
        ),
      }
    )
  }
