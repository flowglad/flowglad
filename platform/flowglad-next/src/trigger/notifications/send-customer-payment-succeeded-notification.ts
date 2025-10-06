import {
  selectOrganizationById,
  selectOrganizationAndFirstMemberByOrganizationId,
} from '@/db/tableMethods/organizationMethods'
import { selectInvoiceLineItemsAndInvoicesByInvoiceWhere } from '@/db/tableMethods/invoiceLineItemMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { sendReceiptEmail } from '@/utils/email'
import { logger, task } from '@trigger.dev/sdk'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { fetchDiscountInfoForInvoice } from '@/utils/discountHelpers'
import { generateInvoicePdfTask } from '../generate-invoice-pdf'
import { generatePaymentReceiptPdfTask } from '../generate-receipt-pdf'
import { selectInvoiceById } from '@/db/tableMethods/invoiceMethods'
import core from '@/utils/core'

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

    // Fetch discount information if this invoice is from a billing period (subscription)
    const discountInfo = await fetchDiscountInfoForInvoice(
      mostUpToDateInvoice
    )

    const result = await sendReceiptEmail({
      invoice: mostUpToDateInvoice,
      invoiceLineItems,
      organizationName: organization.name,
      to: [customer.email],
      organizationId: organization.id,
      customerId: customer.id,
      replyTo: orgAndFirstMember?.user.email ?? null,
      discountInfo,
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
    if (core.IS_TEST) {
      return {
        message: 'Email sent successfully',
      }
    }
    return await sendCustomerPaymentSucceededNotificationTask.trigger(
      { paymentId },
      {
        idempotencyKey: paymentId,
      }
    )
  }
