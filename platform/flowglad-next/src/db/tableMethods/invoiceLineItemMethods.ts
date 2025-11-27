import { eq, inArray } from 'drizzle-orm'
import uniqBy from 'ramda/src/uniqBy'
import {
  type InvoiceLineItem,
  type InvoiceWithLineItems,
  invoiceLineItems,
  invoiceLineItemsInsertSchema,
  invoiceLineItemsSelectSchema,
  invoiceLineItemsUpdateSchema,
} from '@/db/schema/invoiceLineItems'
import {
  createBulkUpsertFunction,
  createInsertFunction,
  createInsertManyFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import core from '@/utils/core'
import {
  type Invoice,
  invoices,
  invoicesSelectSchema,
} from '../schema/invoices'
import {
  invoiceIsInTerminalState,
  selectInvoiceById,
} from './invoiceMethods'

const config: ORMMethodCreatorConfig<
  typeof invoiceLineItems,
  typeof invoiceLineItemsSelectSchema,
  typeof invoiceLineItemsInsertSchema,
  typeof invoiceLineItemsUpdateSchema
> = {
  selectSchema: invoiceLineItemsSelectSchema,
  insertSchema: invoiceLineItemsInsertSchema,
  updateSchema: invoiceLineItemsUpdateSchema,
  tableName: 'invoice_line_items',
}

export const selectInvoiceLineItemById = createSelectById(
  invoiceLineItems,
  config
)

export const insertInvoiceLineItem = createInsertFunction(
  invoiceLineItems,
  config
)

export const updateInvoiceLineItem = createUpdateFunction(
  invoiceLineItems,
  config
)

export const insertInvoiceLineItems = createInsertManyFunction(
  invoiceLineItems,
  config
)

export const selectInvoiceLineItems = createSelectFunction(
  invoiceLineItems,
  config
)

/**
 * Transforms results from a DB query into a normalized shape that's
 * ready for use in application logic
 * @param rawResult
 * @returns
 */
const transformInvoiceLineItemAndInvoiceTuplesToInvoicesWithLineItems =
  (
    rawResult: {
      invoiceLineItem: InvoiceLineItem.Record
      invoice: Invoice.Record
    }[]
  ): InvoiceWithLineItems[] => {
    const invoiceLineItemsByinvoiceId = core.groupBy(
      (item) => `${item.invoiceId}`,
      rawResult.map((row) => row.invoiceLineItem)
    )
    const uniqueInvoices = uniqBy(
      (item) => `${item.id}`,
      rawResult.map((row) => row.invoice)
    )
    return uniqueInvoices.map((invoice) => {
      const parsedInvoice = invoicesSelectSchema.parse(invoice)
      const invoiceLineItemsForInvoice =
        invoiceLineItemsByinvoiceId[`${invoice.id}`]
      const invoiceWithLineItems: InvoiceWithLineItems = {
        invoice: parsedInvoice,
        invoiceLineItems: invoiceLineItemsForInvoice.map((item) =>
          invoiceLineItemsSelectSchema.parse(item)
        ),
      }
      return invoiceWithLineItems
    })
  }

export const selectInvoiceLineItemsAndInvoicesByInvoiceWhere = async (
  whereConditions: Invoice.Where,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      invoiceLineItem: invoiceLineItems,
      invoice: invoices,
    })
    .from(invoiceLineItems)
    .leftJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(whereClauseFromObject(invoices, whereConditions))

  return transformInvoiceLineItemAndInvoiceTuplesToInvoicesWithLineItems(
    result.map((row) => ({
      invoiceLineItem: invoiceLineItemsSelectSchema.parse(
        row.invoiceLineItem
      ),
      invoice: invoicesSelectSchema.parse(row.invoice),
    }))
  )
}

export const deleteInvoiceLineItemsByinvoiceId = async (
  invoiceId: string,
  transaction: DbTransaction
) => {
  const invoice = await selectInvoiceById(invoiceId, transaction)
  if (invoiceIsInTerminalState(invoice)) {
    throw Error(
      `Cannot delete invoice line items for a terminal invoice. Invoice: ${invoice.id}; invoice status: ${invoice.status}`
    )
  }
  await transaction
    .delete(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
}

export const deleteInvoiceLineItems = async (
  ids: { id: string }[],
  transaction: DbTransaction
) => {
  return transaction.delete(invoiceLineItems).where(
    inArray(
      invoiceLineItems.id,
      ids.map((id) => id.id)
    )
  )
}

export const selectInvoiceLineItemsPaginated =
  createPaginatedSelectFunction(invoiceLineItems, config)

export const bulkUpsertInvoiceLineItems = createBulkUpsertFunction(
  invoiceLineItems,
  config
)
