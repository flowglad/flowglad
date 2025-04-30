import { logger, task } from '@trigger.dev/sdk/v3'
import { Invoice } from '@/db/schema/invoices'
import {
  InvoiceStatus,
  PaymentStatus,
  SupabaseUpdatePayload,
} from '@/types'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import { sendReceiptEmail } from '@/utils/email'
import { selectCustomerAndCustomerTableRows } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { generatePaymentReceiptPdfTask } from '../generate-receipt-pdf'
import { selectPayments } from '@/db/tableMethods/paymentMethods'

interface ChangeCheckerParams {
  oldRecord: Invoice.Record
  newRecord: Invoice.Record
}

const invoiceStatusChangedToPaid = (params: ChangeCheckerParams) => {
  const { oldRecord, newRecord } = params
  return (
    oldRecord.status !== InvoiceStatus.Paid &&
    newRecord.status === InvoiceStatus.Paid
  )
}

export const invoiceUpdatedTask = task({
  id: 'invoice-updated',
  run: async (
    payload: SupabaseUpdatePayload<Invoice.Record>,
    { ctx }
  ) => {
    logger.log(JSON.stringify({ payload, ctx }, null, 2))

    const { old_record: oldRecord, record: newRecord } = payload

    if (invoiceStatusChangedToPaid({ oldRecord, newRecord })) {
      const {
        invoiceLineItems,
        customer,
        organization,
        paymentForInvoice,
      } = await adminTransaction(async ({ transaction }) => {
        const invoiceLineItems = await selectInvoiceLineItems(
          { invoiceId: newRecord.id },
          transaction
        )

        const [{ customer }] =
          await selectCustomerAndCustomerTableRows(
            {
              id: newRecord.customerId,
            },
            transaction
          )
        if (!customer) {
          throw new Error(
            `Customer not found for invoice ${newRecord.id}`
          )
        }

        const organization = await selectOrganizationById(
          customer.organizationId,
          transaction
        )
        if (!organization) {
          throw new Error(
            `Organization not found for invoice ${newRecord.id}`
          )
        }
        logger.info(`Sending receipt email to ${customer.email}`)
        const [paymentForInvoice] = await selectPayments(
          { invoiceId: newRecord.id },
          transaction
        )
        return {
          invoice: newRecord,
          invoiceLineItems,
          customer,
          organization,
          paymentForInvoice,
          message: 'Receipt email sent successfully',
        }
      })
      await generatePaymentReceiptPdfTask.triggerAndWait({
        paymentId: paymentForInvoice.id,
      })
      // sendReceiptEmail now sends the invoice rather than the receipt
      // await sendReceiptEmail({
      //   to: [customer.email],
      //   invoice: newRecord,
      //   invoiceLineItems,
      //   organizationName: organization.name,
      //   organizationId: organization.id,
      //   customerExternalId: customer.externalId,
      // })
    }

    return {
      message: 'No action required',
    }
  },
})
