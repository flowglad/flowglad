import { logger, task } from '@trigger.dev/sdk'
import { Result } from 'better-result'
import { comprehensiveAdminTransaction } from '@/db/adminTransaction'
import type { Invoice } from '@/db/schema/invoices'
import { selectCustomerAndCustomerTableRows } from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import { NotFoundError } from '@/errors'
import { InvoiceStatus, type SupabaseUpdatePayload } from '@/types'
import { generatePaymentReceiptPdfTask } from '../generate-receipt-pdf'

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
      } = await comprehensiveAdminTransaction(
        async ({ transaction }) => {
          const invoiceLineItems = await selectInvoiceLineItems(
            { invoiceId: newRecord.id },
            transaction
          )

          const customerRows =
            await selectCustomerAndCustomerTableRows(
              {
                id: newRecord.customerId,
              },
              transaction
            )
          const customer = customerRows[0]?.customer
          if (!customer) {
            return Result.err(
              new NotFoundError('Customer', newRecord.customerId)
            )
          }

          const organization = (
            await selectOrganizationById(
              customer.organizationId,
              transaction
            )
          ).unwrap()
          if (!organization) {
            return Result.err(
              new NotFoundError(
                'Organization',
                customer.organizationId
              )
            )
          }
          logger.info(
            `Generating receipt PDF for customer ${customer.email}`
          )
          const payments = await selectPayments(
            { invoiceId: newRecord.id },
            transaction
          )
          const paymentForInvoice = payments[0]
          return Result.ok({
            invoice: newRecord,
            invoiceLineItems,
            customer,
            organization,
            paymentForInvoice,
          })
        }
      )
      if (paymentForInvoice) {
        await generatePaymentReceiptPdfTask.triggerAndWait({
          paymentId: paymentForInvoice.id,
        })
      } else {
        logger.warn(
          `No payment found for invoice ${newRecord.id}, skipping receipt PDF generation`
        )
      }
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
