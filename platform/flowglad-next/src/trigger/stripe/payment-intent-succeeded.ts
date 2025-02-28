import { adminTransaction } from '@/db/databaseMethods'
import { selectCustomerProfileAndCustomerFromCustomerProfileWhere } from '@/db/tableMethods/customerProfileMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { sendOrganizationPaymentNotificationEmail } from '@/utils/email'

import { logger, task } from '@trigger.dev/sdk/v3'
import Stripe from 'stripe'

export const stripePaymentIntentSucceededTask = task({
  id: 'stripe-payment-intent-succeeded',
  run: async (
    payload: Stripe.PaymentIntentSucceededEvent,
    { ctx }
  ) => {
    logger.log('Payment intent succeeded', { payload, ctx })
    const metadata = payload.data.object.metadata
    /**
     * If the payment intent is for a billing run,
     * process it on own track, and then terminate
     */
    if ('billingRunId' in metadata) {
      return adminTransaction(async ({ transaction }) => {
        await processPaymentIntentEventForBillingRun(
          payload,
          transaction
        )
        return
      })
    }

    const {
      invoice,
      membersForOrganization,
      organization,
      customerProfileAndCustomer,
    } = await adminTransaction(async ({ transaction }) => {
      const { payment } = await processPaymentIntentStatusUpdated(
        payload.data.object,
        transaction
      )

      const purchase = await selectPurchaseById(
        payment.PurchaseId!,
        transaction
      )

      const [invoice] =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { id: payment.InvoiceId },
          transaction
        )

      const [customerProfileAndCustomer] =
        await selectCustomerProfileAndCustomerFromCustomerProfileWhere(
          {
            id: purchase.CustomerProfileId,
          },
          transaction
        )

      const organization = await selectOrganizationById(
        purchase.OrganizationId,
        transaction
      )

      const membersForOrganization =
        await selectMembershipsAndUsersByMembershipWhere(
          { OrganizationId: organization.id },
          transaction
        )

      return {
        invoice,
        invoiceLineItems: invoice.invoiceLineItems,
        purchase,
        organization,
        customerProfileAndCustomer,
        membersForOrganization,
      }
    })
    logger.info('Sending organization payment notification email')

    await sendOrganizationPaymentNotificationEmail({
      to: membersForOrganization.map(({ user }) => user.email ?? ''),
      amount: payload.data.object.amount,
      invoiceNumber: invoice.invoiceNumber,
      customerProfileId:
        customerProfileAndCustomer.customerProfile.id!,
      organizationName: organization.name!,
      currency: invoice.currency,
    })

    return {
      message: 'Ok',
    }
  },
})
