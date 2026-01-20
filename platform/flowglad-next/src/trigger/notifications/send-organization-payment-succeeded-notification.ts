import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import type { CurrencyCode } from '@/types'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { isNil } from '@/utils/core'
import { sendOrganizationPaymentNotificationEmail } from '@/utils/email'
import { filterEligibleRecipients } from '@/utils/notifications'

interface PaymentSucceededNotificationData {
  organizationId: string
  customerId: string
  invoiceId: string
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

    const { organization, customer, usersAndMemberships } =
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

    if (!organization || !customer) {
      throw new Error('Organization or customer not found')
    }

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
  testSafeTriggerInvoker(
    async (paymentData: PaymentSucceededNotificationData) => {
      await sendOrganizationPaymentSucceededNotificationTask.trigger(
        {
          paymentData,
        },
        {
          idempotencyKey: await createTriggerIdempotencyKey(
            `send-organization-payment-succeeded-notification-${paymentData.invoiceId}`
          ),
        }
      )
    }
  )
