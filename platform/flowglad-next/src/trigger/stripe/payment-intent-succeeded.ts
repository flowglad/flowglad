import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
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
import { InvoiceStatus } from '@/types'
import { safelyIncrementDiscountRedemptionSubscriptionPayment } from '@/utils/bookkeeping/discountRedemptionTracking'
import { sendCustomerPaymentSucceededNotificationIdempotently } from '../notifications/send-customer-payment-succeeded-notification'
import { Event } from '@/db/schema/events'
import { storeTelemetry } from '@/utils/redis'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { processTerminalPaymentIntent } from '@/subscriptions/billingRunHelpers'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import { selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId } from '@/db/tableMethods/billingPeriodItemMethods'
import { LedgerTransactionType } from '@/types'
import { adminTransaction } from '@/db/adminTransaction'

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
      const result = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          return await processPaymentIntentEventForBillingRun(
            payload,
            transaction
          )
        }
      )

      // Check if billing period transition ledger command has already been created
      // to avoid duplicate transaction execution
      // FIXME: We are checking here to see if a ledger command has already been processed for this
      // billing period. We should do that idepotency check inside of the ledger manager.
      const hasExistingTransition = await adminTransaction(
        async ({ transaction }) => {
          const billingRun = await selectBillingRunById(
            metadata.billingRunId,
            transaction
          )

          const { subscription, billingPeriod } =
            await selectBillingPeriodItemsBillingPeriodSubscriptionAndOrganizationByBillingPeriodId(
              billingRun.billingPeriodId,
              transaction
            )

          const [existingTransition] = await selectLedgerTransactions(
            {
              subscriptionId: subscription.id,
              type: LedgerTransactionType.BillingPeriodTransition,
              initiatingSourceId: billingPeriod.id,
            },
            transaction
          )

          return !!existingTransition
        },
        {
          livemode: result.billingRun.livemode,
        }
      )

      // Only process terminal payment intent if transition hasn't been created yet
      if (!hasExistingTransition) {
        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            const billingRun = await selectBillingRunById(
              metadata.billingRunId,
              transaction
            )
            return await processTerminalPaymentIntent(
              payload.data.object,
              billingRun,
              transaction
            )
          }
        )
      }

      return result
    }

    const {
      invoice,
      membersForOrganization,
      organization,
      customer,
      payment,
    } = await comprehensiveAdminTransaction(
      async ({ transaction }) => {
        const paymentResult = await processPaymentIntentStatusUpdated(
          payload.data.object,
          transaction
        )
        const {
          result: { payment },
          eventsToInsert,
          ledgerCommand,
        } = paymentResult

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
        const eventInserts: Event.Insert[] = [
          ...(eventsToInsert ?? []),
        ]

        return {
          result,
          eventsToInsert: eventInserts,
          ledgerCommand,
        }
      },
      {}
    )

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
      livemode: invoice.livemode,
    })

    await storeTelemetry('payment', payment.id, ctx.run.id)

    return {
      message: 'Ok',
    }
  },
})
