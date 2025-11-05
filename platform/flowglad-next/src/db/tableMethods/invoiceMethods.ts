import * as R from 'ramda'
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
import { and, or, eq, count, desc, sql } from 'drizzle-orm'
import { InvoiceLineItem } from '../schema/invoiceLineItems'
import { createCursorPaginatedSelectFunction } from '@/db/tableUtils'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import { Customer, customers } from '@/db/schema/customers'
import { invoicesPaginatedTableRowDataSchema } from '@/db/schema/invoiceLineItems'

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

export const selectInvoicesTableRowData =
  createCursorPaginatedSelectFunction(
    invoices,
    config,
    invoicesPaginatedTableRowDataSchema,
    async (data: Invoice.Record[], transaction) => {
      const customerIds = data.map((item) => item.customerId)
      const invoiceIds = data.map((item) => item.id)

      const [customers, invoiceLineItems] = await Promise.all([
        selectCustomers({ id: customerIds }, transaction),
        selectInvoiceLineItems(
          { invoiceId: invoiceIds },
          transaction
        ),
      ])

      const customersById = new Map(
        customers.map((customer: Customer.Record) => [
          customer.id,
          customer,
        ])
      )
      const invoiceLineItemsByInvoiceId = R.groupBy(
        (item: InvoiceLineItem.Record) => item.invoiceId,
        invoiceLineItems
      )

      return data.map((invoice) => ({
        invoice,
        invoiceLineItems:
          invoiceLineItemsByInvoiceId[invoice.id] || [],
        customer: customersById.get(invoice.customerId)!,
      }))
    },
    undefined,
    ({ searchQuery }) => {
      // FIXME: Consider pattern detection before searching by ID or invoice number.
      // - ID pattern: ^[a-z]+_[A-Za-z0-9_-]+$ (e.g., 'inv_abc123')
      // - Invoice number pattern: ^[A-Za-z0-9]+-.*$ (e.g., 'ABC1234-00001', 'INV-prefix-001')
      // Only include exact match checks when query matches respective patterns to avoid
      // unnecessary database queries for non-matching patterns.
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery
      return trimmedQuery && trimmedQuery !== ''
        ? or(
            eq(invoices.id, trimmedQuery),
            eq(invoices.invoiceNumber, trimmedQuery),
            sql`exists (
              select 1 from ${customers} c
              where c.id = ${invoices.customerId}
                and c.name ilike ${`%${trimmedQuery}%`}
            )`
          )
        : undefined
    }
  )
