import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import type Stripe from 'stripe'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPurchaseById } from '@/db/tableMethods/purchaseMethods'
import type { TransactionEffectsContext } from '@/db/types'
import { ValidationError } from '@/errors'
import { processOutcomeForBillingRun } from '@/subscriptions/processBillingRunPaymentIntents'
import { InvoiceStatus } from '@/types'
import { safelyIncrementDiscountRedemptionSubscriptionPayment } from '@/utils/bookkeeping/discountRedemptionTracking'
import { processPaymentIntentStatusUpdated } from '@/utils/bookkeeping/processPaymentIntentStatusUpdated'
import { createStripeTaxTransactionIfNeededForPayment } from '@/utils/bookkeeping/stripeTaxTransactions'
import { storeTelemetry } from '@/utils/redis'
import { tracedTaskRun } from '@/utils/triggerTracing'
import { generateInvoicePdfIdempotently } from '../generate-invoice-pdf'
import { sendCustomerPaymentSucceededNotificationIdempotently } from '../notifications/send-customer-payment-succeeded-notification'
import { sendOrganizationPaymentSucceededNotificationIdempotently } from '../notifications/send-organization-payment-succeeded-notification'

export const stripePaymentIntentSucceededTask = task({
  id: 'stripe-payment-intent-succeeded',
  run: async (
    payload: Stripe.PaymentIntentSucceededEvent,
    { ctx }
  ) => {
    return tracedTaskRun(
      'stripePaymentIntentSucceeded',
      async () => {
        logger.log('Payment intent succeeded', { payload, ctx })
        const metadata = payload.data.object.metadata
        /**
         * If the payment intent is for a billing run,
         * process it on own track, and then terminate
         */
        if ('billingRunId' in metadata) {
          const result = await comprehensiveAdminTransaction(
            async (params) => {
              const effectsCtx: TransactionEffectsContext = {
                transaction: params.transaction,
                cacheRecomputationContext:
                  params.cacheRecomputationContext,
                invalidateCache: params.invalidateCache,
                emitEvent: params.emitEvent,
                enqueueLedgerCommand: params.enqueueLedgerCommand,
              }
              const billingResult = await processOutcomeForBillingRun(
                { input: payload },
                effectsCtx
              )
              return Result.ok(billingResult)
            }
          )
          return result
        }

        const { invoice, organization, customer, payment } =
          await comprehensiveAdminTransaction(async (ctx) => {
            const { transaction } = ctx
            const { payment } =
              await processPaymentIntentStatusUpdated(
                payload.data.object,
                ctx
              )

            if (!payment.purchaseId) {
              return Result.err(
                new ValidationError(
                  'purchaseId',
                  `Payment ${payment.id} has no purchaseId, cannot process payment intent succeeded event`
                )
              )
            }

            const purchase = await selectPurchaseById(
              payment.purchaseId,
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
              payment,
            }

            return Result.ok(result)
          }, {})

        await comprehensiveAdminTransaction(
          async ({ transaction }) => {
            await createStripeTaxTransactionIfNeededForPayment(
              { organization, payment, invoice },
              transaction
            )
            return Result.ok(null)
          }
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
        await sendOrganizationPaymentSucceededNotificationIdempotently(
          {
            organizationId: organization.id,
            customerId: customer.id,
            paymentId: payment.id,
            amount: payload.data.object.amount,
            currency: invoice.currency,
            invoiceNumber: invoice.invoiceNumber,
            livemode: invoice.livemode,
          }
        )

        await storeTelemetry('payment', payment.id, ctx.run.id)

        return {
          message: 'Ok',
        }
      },
      { 'trigger.payment_intent_id': payload.data.object.id }
    )
  },
})
