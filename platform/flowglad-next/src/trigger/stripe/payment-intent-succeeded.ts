import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import { selectCustomerAndCustomerFromCustomerWhere } from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import { processPaymentIntentEventForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { sendOrganizationPaymentNotificationEmail } from '@/utils/email'

import { logger, task } from '@trigger.dev/sdk'
import Stripe from 'stripe'
import { generateInvoicePdfIdempotently } from '../generate-invoice-pdf'
import { InvoiceStatus, LedgerTransactionType } from '@/types'
import { safelyIncrementDiscountRedemptionSubscriptionPayment } from '@/utils/bookkeeping/discountRedemptionTracking'
import { sendCustomerPaymentSucceededNotificationIdempotently } from '../notifications/send-customer-payment-succeeded-notification'
import { SettleInvoiceUsageCostsLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'

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
      return comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentEventForBillingRun(
            payload,
            transaction
          )
        }
      )
    }

    const {
      invoice,
      membersForOrganization,
      organization,
      customerAndCustomer,
      payment,
    } = await adminTransaction(async ({ transaction }) => {
      const { payment } = await processPaymentIntentStatusUpdated(
        payload.data.object,
        transaction
      )

      const purchase = await selectPurchaseById(
        payment.purchaseId!,
        transaction
      )

      const [invoice] =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { id: payment.invoiceId },
          transaction
        )

      const [customerAndCustomer] =
        await selectCustomerAndCustomerFromCustomerWhere(
          {
            id: purchase.customerId,
          },
          transaction
        )

      const organization = await selectOrganizationById(
        purchase.organizationId,
        transaction
      )

      const membersForOrganization =
        await selectMembershipsAndUsersByMembershipWhere(
          { organizationId: organization.id },
          transaction
        )

      await safelyIncrementDiscountRedemptionSubscriptionPayment(
        payment,
        transaction
      )

      return {
        invoice: invoice.invoice,
        invoiceLineItems: invoice.invoiceLineItems,
        purchase,
        organization,
        customerAndCustomer,
        membersForOrganization,
        payment,
      }
    })

    /**
     * Generate the invoice PDF, which should be finalized now
     */
    await generateInvoicePdfIdempotently(invoice.id)

    if (invoice.status === InvoiceStatus.Paid) {
      await sendCustomerPaymentSucceededNotificationIdempotently(
        payment.id
      )
    }
    /**
     * Send the organization payment notification email
     */
    logger.info('Sending organization payment notification email')
    const customer = customerAndCustomer.customer
    await sendOrganizationPaymentNotificationEmail({
      to: membersForOrganization.map(({ user }) => user.email ?? ''),
      amount: payload.data.object.amount,
      invoiceNumber: invoice.invoiceNumber,
      customerId: customer.id,
      organizationName: organization.name,
      currency: invoice.currency,
      customerName: customer.name,
      customerEmail: customer.email,
    })

    return {
      message: 'Ok',
    }
  },
})
