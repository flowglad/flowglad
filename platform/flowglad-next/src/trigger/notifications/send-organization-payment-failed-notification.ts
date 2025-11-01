import { isNil } from '@/utils/core'
import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { OrganizationPaymentFailedNotificationEmail } from '@/email-templates/organization/organization-payment-failed'
import { safeSend } from '@/utils/email'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'
import { CurrencyCode } from '@/types'

interface PaymentFailedNotificationData {
  organizationId: string
  customerId: string
  amount: number
  currency: CurrencyCode
  invoiceNumber?: string
  failureReason?: string
  livemode: boolean
}

export const sendOrganizationPaymentFailedNotificationTask = task({
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

    await safeSend({
      from: 'Flowglad <notifications@flowglad.com>',
      to: usersAndMemberships
        .map(({ user }) => user.email)
        .filter((email) => !isNil(email)),
      subject: `Payment Failed: ${customer.name} payment of ${paymentData.amount} ${paymentData.currency} failed`,
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
