import {
  selectOrganizationById,
  selectOrganizationAndFirstMemberByOrganizationId,
} from '@/db/tableMethods/organizationMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { sendPaymentFailedEmail } from '@/utils/email'
import { logger, task } from '@trigger.dev/sdk'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { generateInvoicePdfTask } from '../generate-invoice-pdf'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import { Payment } from '@/db/schema/payments'
import {
  createTriggerIdempotencyKey,
  testSafeTriggerInvoker,
} from '@/utils/backendCore'

export const sendCustomerPaymentFailedNotificationTask = task({
  id: 'send-customer-payment-failed-notification',
  run: async (payload: { paymentId: string }) => {
    const {
      invoice,
      invoiceLineItems,
      customer,
      organization,
    } = await adminTransaction(async ({ transaction }) => {
      const payment = await selectPaymentById(
        payload.paymentId,
        transaction
      )
      const [{ invoice, invoiceLineItems }] =
        await selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
          { id: payment.invoiceId },
          transaction
        )
      const customer = await selectCustomerById(
        payment.customerId,
        transaction
      )
      const organization = await selectOrganizationById(
        customer.organizationId,
        transaction
      )
      return {
        payment,
        invoice,
        invoiceLineItems,
        customer,
        organization,
      }
    })

    if (!invoice.pdfURL) {
      await generateInvoicePdfTask.triggerAndWait({
        invoiceId: invoice.id,
      })
    }

    // Fetch the latest invoice after the PDF generation task has completed
    const { mostUpToDateInvoice, orgAndFirstMember } =
      await adminTransaction(async ({ transaction }) => {
        const mostUpToDateInvoice = await selectInvoiceById(
          invoice.id,
          transaction
        )
        const orgAndFirstMember =
          await selectOrganizationAndFirstMemberByOrganizationId(
            organization.id,
            transaction
          )
        return { mostUpToDateInvoice, orgAndFirstMember }
      })

    const result = await sendPaymentFailedEmail({
      invoiceNumber: mostUpToDateInvoice.invoiceNumber,
      orderDate: mostUpToDateInvoice.createdAt,
      lineItems: invoiceLineItems.map((item) => ({
        name: item.description ?? '-',
        price: item.price,
        quantity: item.quantity,
      })),
      currency: mostUpToDateInvoice.currency,
      organizationName: organization.name,
      to: [customer.email],
      replyTo: orgAndFirstMember?.user.email,
    })

    if (result?.error) {
      logger.error('Error sending payment failed email', {
        error: result.error,
      })
    }

    return {
      message: 'Email sent successfully',
    }
  },
})

export const sendCustomerPaymentFailedNotificationIdempotently =
  testSafeTriggerInvoker(async (paymentRecord: Payment.Record) => {
    return await sendCustomerPaymentFailedNotificationTask.trigger(
      { paymentId: paymentRecord.id },
      {
        idempotencyKey: await createTriggerIdempotencyKey(
          `send-customer-payment-failed-notification-${paymentRecord.id}`
        ),
      }
    )
  })
