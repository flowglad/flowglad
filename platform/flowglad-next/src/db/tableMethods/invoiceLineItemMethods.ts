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
import { prices } from '../schema/prices'
import {
  derivePricingModelIdForInvoice,
  invoiceIsInTerminalState,
  selectInvoiceById,
} from './invoiceMethods'
import { derivePricingModelIdFromPrice } from './priceMethods'

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

/**
 * Derives pricingModelId for an invoice line item with COALESCE logic.
 * Priority: invoice > price -> product
 * Used for invoice line item inserts.
 */
export const derivePricingModelIdForInvoiceLineItem = async (
  data: {
    invoiceId?: string | null
    priceId?: string | null
  },
  transaction: DbTransaction
): Promise<string> => {
  // Try invoice first (COALESCE logic)
  if (data.invoiceId) {
    const invoice = await selectInvoiceById(
      data.invoiceId,
      transaction
    )
    return invoice.pricingModelId
  }

  // Fall back to price -> product
  if (data.priceId) {
    return await derivePricingModelIdFromPrice(
      data.priceId,
      transaction
    )
  }

  throw new Error(
    'Cannot derive pricingModelId for invoice line item: both invoiceId and priceId are null or have no pricingModelId'
  )
}

const baseInsertInvoiceLineItem = createInsertFunction(
  invoiceLineItems,
  config
)

export const insertInvoiceLineItem = async (
  invoiceLineItemInsert: InvoiceLineItem.Insert,
  transaction: DbTransaction
): Promise<InvoiceLineItem.Record> => {
  const pricingModelId =
    invoiceLineItemInsert.pricingModelId ??
    (await derivePricingModelIdForInvoiceLineItem(
      {
        invoiceId: invoiceLineItemInsert.invoiceId,
        priceId: invoiceLineItemInsert.priceId,
      },
      transaction
    ))
  return baseInsertInvoiceLineItem(
    {
      ...invoiceLineItemInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateInvoiceLineItem = createUpdateFunction(
  invoiceLineItems,
  config
)

const baseInsertInvoiceLineItems = createInsertManyFunction(
  invoiceLineItems,
  config
)

// TODO: improve performance by gathering unique invoiceIds and priceIds and deriving pricingModelIds for them
export const insertInvoiceLineItems = async (
  inserts: InvoiceLineItem.Insert[],
  transaction: DbTransaction
): Promise<InvoiceLineItem.Record[]> => {
  // Derive pricingModelId for each insert
  const insertsWithPricingModelId = await Promise.all(
    inserts.map(async (insert) => {
      const pricingModelId =
        insert.pricingModelId ??
        (await derivePricingModelIdForInvoiceLineItem(
          {
            invoiceId: insert.invoiceId,
            priceId: insert.priceId,
          },
          transaction
        ))
      return {
        ...insert,
        pricingModelId,
      }
    })
  )
  return baseInsertInvoiceLineItems(
    insertsWithPricingModelId,
    transaction
  )
}

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

const baseBulkUpsertInvoiceLineItems = createBulkUpsertFunction(
  invoiceLineItems,
  config
)

// TODO: improve performance by gathering unique invoiceIds and priceIds and deriving pricingModelIds for them
export const bulkUpsertInvoiceLineItems = async (
  inserts: InvoiceLineItem.Insert[],
  target: Parameters<typeof baseBulkUpsertInvoiceLineItems>[1],
  transaction: DbTransaction
): Promise<InvoiceLineItem.Record[]> => {
  // Derive pricingModelId for each insert
  const insertsWithPricingModelId = await Promise.all(
    inserts.map(async (insert) => {
      const pricingModelId =
        insert.pricingModelId ??
        (await derivePricingModelIdForInvoiceLineItem(
          {
            invoiceId: insert.invoiceId,
            priceId: insert.priceId,
          },
          transaction
        ))
      return {
        ...insert,
        pricingModelId,
      }
    })
  )
  return baseBulkUpsertInvoiceLineItems(
    insertsWithPricingModelId,
    target,
    transaction
  )
}
