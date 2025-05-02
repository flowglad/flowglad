import * as R from 'ramda'
import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createUpsertFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  whereClauseFromObject,
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
import { and, eq, count, desc } from 'drizzle-orm'
import { CheckoutInfoCore } from './purchaseMethods'
import { customers } from '@/db/schema/customers'
import {
  InvoiceLineItem,
  invoiceLineItems,
  invoiceLineItemsSelectSchema,
} from '../schema/invoiceLineItems'

const config: ORMMethodCreatorConfig<
  typeof invoices,
  typeof invoicesSelectSchema,
  typeof invoicesInsertSchema,
  typeof invoicesUpdateSchema
> = {
  selectSchema: invoicesSelectSchema,
  insertSchema: invoicesInsertSchema,
  updateSchema: invoicesUpdateSchema,
  tableName: 'invoices',
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
      subscriptionId: invoice.subscriptionId,
    } as Invoice.Update,
    transaction
  )
}

export const selectInvoicesPaginated = createPaginatedSelectFunction(
  invoices,
  config
)

export const selectInvoiceCountsByStatus = async (
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      status: invoices.status,
      count: count(),
    })
    .from(invoices)
    .groupBy(invoices.status)

  return result.map((item) => ({
    status: item.status as InvoiceStatus,
    count: item.count,
  }))
}

export const selectInvoicesTableRowData = async (
  params: Invoice.Where,
  transaction: DbTransaction
) => {
  const invoiceRows = await transaction
    .select({
      invoice: invoices,
      customer: customers,
      invoiceLineItems: invoiceLineItems,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(
      invoiceLineItems,
      eq(invoices.id, invoiceLineItems.invoiceId)
    )
    .where(whereClauseFromObject(invoices, params))
    .orderBy(desc(invoices.createdAt))

  const invoiceLineItemRows: InvoiceLineItem.Record[] = invoiceRows
    .filter((row) => row.invoiceLineItems !== null)
    .map((row) => row.invoiceLineItems as InvoiceLineItem.Record)

  // Group invoice line items by invoice id
  const invoiceLineItemsByInvoiceId = R.groupBy(
    (row) => row?.invoiceId,
    invoiceLineItemRows
  )

  // Get unique invoices
  const uniqueInvoices = Array.from(
    new Map(
      invoiceRows.map((row) => [
        row.invoice.id,
        {
          invoice: invoicesSelectSchema.parse(row.invoice),
          invoiceLineItems:
            invoiceLineItemsByInvoiceId[row.invoice.id] || [],
          customer: {
            id: row.customer.id,
            name: row.customer.name,
          },
        },
      ])
    ).values()
  )

  return uniqueInvoices
}
