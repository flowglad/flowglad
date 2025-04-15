import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { sendReceiptEmail } from '@/utils/email'
import { logger, task } from '@trigger.dev/sdk/v3'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { generateInvoicePdfTask } from '../generate-invoice-pdf'
import { generatePaymentReceiptPdfTask } from '../generate-receipt-pdf'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'

export const sendCustomerPaymentSucceededNotificationTask = task({
  id: 'send-customer-payment-succeeded-notification',
  run: async (payload: { paymentId: string }, { ctx }) => {
    const {
      invoice,
      invoiceLineItems,
      customer,
      organization,
      payment,
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
    if (!invoice.receiptPdfURL) {
      await generatePaymentReceiptPdfTask.triggerAndWait({
        paymentId: payment.id,
      })
    }
    // Fetch the latest invoice after the PDF generation tasks have completed
    const mostUpToDateInvoice = await adminTransaction(
      async ({ transaction }) => {
        return selectInvoiceById(invoice.id, transaction)
      }
    )

    const result = await sendReceiptEmail({
      invoice: mostUpToDateInvoice,
      invoiceLineItems,
      organizationName: organization.name,
      to: [customer.email],
    })

    if (result?.error) {
      logger.error('Error sending receipt email', {
        error: result.error,
      })
    }

    return {
      message: 'Email sent successfully',
    }
  },
})

export const sendCustomerPaymentSucceededNotificationIdempotently =
  async (paymentId: string) => {
    return await sendCustomerPaymentSucceededNotificationTask.trigger(
      { paymentId },
      {
        idempotencyKey: paymentId,
      }
    )
  }
