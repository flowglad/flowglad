import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createUpsertFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  Invoice,
  invoices,
  invoicesInsertSchema,
  invoicesSelectSchema,
  invoicesUpdateSchema,
} from '@/db/schema/invoices'
import { InvoiceStatus } from '@/types'
import { DbTransaction } from '@/db/types'
import { and, eq } from 'drizzle-orm'
import { BillingInfoCore } from './purchaseMethods'

const config: ORMMethodCreatorConfig<
  typeof invoices,
  typeof invoicesSelectSchema,
  typeof invoicesInsertSchema,
  typeof invoicesUpdateSchema
> = {
  selectSchema: invoicesSelectSchema,
  insertSchema: invoicesInsertSchema,
  updateSchema: invoicesUpdateSchema,
}

export const selectInvoiceById = createSelectById(invoices, config)

export const insertInvoice = createInsertFunction(invoices, config)

export const updateInvoice = createUpdateFunction(invoices, config)

export const selectInvoices = createSelectFunction(invoices, config)

export const upsertInvoiceByInvoiceNumber = createUpsertFunction(
  invoices,
  [invoices.invoiceNumber],
  config
)

export const deleteOpenInvoicesForPurchase = (
  purchaseId: string,
  transaction: DbTransaction
) => {
  return transaction
    .delete(invoices)
    .where(
      and(
        eq(invoices.purchaseId, purchaseId),
        eq(invoices.status, InvoiceStatus.Open)
      )
    )
}

export const invoiceIsInTerminalState = (
  invoice: Invoice.ClientRecord
) => {
  return (
    invoice.status === InvoiceStatus.Paid ||
    invoice.status === InvoiceStatus.Uncollectible ||
    invoice.status === InvoiceStatus.Void ||
    invoice.status === InvoiceStatus.FullyRefunded
  )
}

export const safelyUpdateInvoiceStatus = (
  invoice: Invoice.Record,
  status: InvoiceStatus,
  transaction: DbTransaction
) => {
  if (invoice.status === status) {
    return invoice
  }
  if (invoiceIsInTerminalState(invoice)) {
    throw new Error(
      `Cannot update invoice ${invoice.id} status to ${status} because it is in terminal state ${invoice.status}`
    )
  }
  return updateInvoice(
    {
      id: invoice.id,
      status,
      type: invoice.type,
      purchaseId: invoice.purchaseId,
      billingPeriodId: invoice.billingPeriodId,
    } as Invoice.Update,
    transaction
  )
}

export const selectInvoicesPaginated = createPaginatedSelectFunction(
  invoices,
  config
)
