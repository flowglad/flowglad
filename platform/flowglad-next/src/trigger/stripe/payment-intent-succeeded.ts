import {
  adminTransaction,
  comprehensiveAdminTransaction,
  eventfulAdminTransaction,
} from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
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
import {
  FlowgladEventType,
  EventNoun,
  InvoiceStatus,
  LedgerTransactionType,
} from '@/types'
import { safelyIncrementDiscountRedemptionSubscriptionPayment } from '@/utils/bookkeeping/discountRedemptionTracking'
import { sendCustomerPaymentSucceededNotificationIdempotently } from '../notifications/send-customer-payment-succeeded-notification'
import { SettleInvoiceUsageCostsLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import { Event } from '@/db/schema/events'
import { constructPaymentSucceededEventHash } from '@/utils/eventHelpers'

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
      customer,
      payment,
    } = await eventfulAdminTransaction(async ({ transaction }) => {
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

      const [customer] = await selectCustomers(
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
      const result = {
        invoice: invoice.invoice,
        invoiceLineItems: invoice.invoiceLineItems,
        purchase,
        organization,
        customer,
        membersForOrganization,
        payment,
      }
      const timestamp = new Date()
      const eventInserts: Event.Insert[] = [
        {
          type: FlowgladEventType.PaymentSucceeded,
          occurredAt: timestamp,
          organizationId: payment.organizationId,
          livemode: payment.livemode,
          payload: {
            object: EventNoun.Payment,
            id: payment.id,
            customer: {
              id: customer.id,
              externalId: customer.externalId,
            },
          },
          submittedAt: timestamp,
          hash: constructPaymentSucceededEventHash(payment),
          metadata: {},
          processedAt: null,
        },
      ]

      return [result, eventInserts]
    }, {})

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
