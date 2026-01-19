import { eq, inArray } from 'drizzle-orm'
import uniqBy from 'ramda/src/uniqBy'
import {
  type InvoiceLineItem,
  type InvoiceWithLineItems,
  invoiceLineItems,
  invoiceLineItemsInsertSchema,
  invoiceLineItemsSelectSchema,
  invoiceLineItemsUpdateSchema,
  invoiceWithLineItemsSchema,
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
import { InvoiceStatus } from '@/types'
import { CacheDependency, cached } from '@/utils/cache'
import core from '@/utils/core'
import { RedisKeyNamespace } from '@/utils/redis'
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

/**
 * Batch derives and maps pricingModelIds for invoice line item inserts.
 * This helper efficiently handles multiple inserts by:
 * 1. Collecting unique (invoiceId, priceId) combinations
 * 2. Deriving pricingModelIds once per unique combination
 * 3. Mapping the derived IDs back to all inserts
 *
 * @param inserts - Array of invoice line item inserts
 * @param transaction - Database transaction
 * @returns Array of inserts with pricingModelId populated
 */
const deriveAndMapPricingModelIdsForInserts = async (
  inserts: InvoiceLineItem.Insert[],
  transaction: DbTransaction
): Promise<InvoiceLineItem.Insert[]> => {
  // Collect unique combinations that need pricingModelId derivation
  const insertsNeedingDerivation = inserts.filter(
    (insert) => !insert.pricingModelId
  )

  // Create a map key for each unique combination
  const createMapKey = (
    invoiceId: string,
    priceId: string | null | undefined
  ) => `${invoiceId}|${priceId || ''}`

  // Collect unique combinations
  const uniqueCombinations = Array.from(
    new Set(
      insertsNeedingDerivation.map((insert) =>
        createMapKey(insert.invoiceId, insert.priceId)
      )
    )
  ).map((key) => {
    const [invoiceId, priceId] = key.split('|')
    return {
      invoiceId,
      priceId: priceId || undefined,
    }
  })

  // Batch derive pricingModelIds for unique combinations
  const pricingModelIdResults = await Promise.all(
    uniqueCombinations.map(async (combo) => ({
      key: createMapKey(combo.invoiceId, combo.priceId),
      pricingModelId: await derivePricingModelIdForInvoiceLineItem(
        combo,
        transaction
      ),
    }))
  )

  // Build map for O(1) lookup
  const pricingModelIdMap = new Map(
    pricingModelIdResults.map((r) => [r.key, r.pricingModelId])
  )

  // Derive pricingModelId for each insert using the map
  return inserts.map((insert) => {
    if (insert.pricingModelId) {
      return insert
    }

    const key = createMapKey(insert.invoiceId, insert.priceId)
    const pricingModelId = pricingModelIdMap.get(key)

    if (!pricingModelId) {
      throw new Error(
        `Could not derive pricingModelId for invoice line item with invoiceId: ${insert.invoiceId}, priceId: ${insert.priceId}`
      )
    }

    return {
      ...insert,
      pricingModelId,
    }
  })
}

export const insertInvoiceLineItems = async (
  inserts: InvoiceLineItem.Insert[],
  transaction: DbTransaction
): Promise<InvoiceLineItem.Record[]> => {
  const insertsWithPricingModelId =
    await deriveAndMapPricingModelIdsForInserts(inserts, transaction)

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

/**
 * Customer-facing invoice statuses used for billing portal display.
 * These are the statuses that customers should see in their billing history.
 */
const customerFacingInvoiceStatuses: InvoiceStatus[] = [
  InvoiceStatus.AwaitingPaymentConfirmation,
  InvoiceStatus.Paid,
  InvoiceStatus.PartiallyRefunded,
  InvoiceStatus.Open,
  InvoiceStatus.FullyRefunded,
]

/**
 * Selects customer-facing invoices with line items by customer ID with caching enabled by default.
 * Pass { ignoreCache: true } as the last argument to bypass the cache.
 *
 * This cache entry depends on customerInvoices - invalidate when
 * invoices for this customer are created, updated, or their status changes.
 *
 * Cache key includes livemode to prevent cross-mode data leakage, since RLS
 * filters invoices by livemode and the same customer could have different
 * invoices in live vs test mode.
 *
 * Note: This function fetches a fixed set of customer-facing statuses:
 * AwaitingPaymentConfirmation, Paid, PartiallyRefunded, Open, FullyRefunded.
 */
export const selectCustomerFacingInvoicesWithLineItems = cached(
  {
    namespace: RedisKeyNamespace.InvoicesByCustomer,
    keyFn: (
      customerId: string,
      _transaction: DbTransaction,
      livemode: boolean
    ) => `${customerId}:${livemode}`,
    schema: invoiceWithLineItemsSchema.array(),
    dependenciesFn: (_result, customerId: string) => [
      CacheDependency.customerInvoices(customerId),
    ],
  },
  async (
    customerId: string,
    transaction: DbTransaction,
    // livemode is used by keyFn for cache key generation, not in the query itself
    // (RLS filters by livemode context set on the transaction)
    _livemode: boolean
  ) => {
    return selectInvoiceLineItemsAndInvoicesByInvoiceWhere(
      {
        customerId,
        status: customerFacingInvoiceStatuses,
      },
      transaction
    )
  }
)

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

export const bulkUpsertInvoiceLineItems = async (
  inserts: InvoiceLineItem.Insert[],
  target: Parameters<typeof baseBulkUpsertInvoiceLineItems>[1],
  transaction: DbTransaction
): Promise<InvoiceLineItem.Record[]> => {
  const insertsWithPricingModelId =
    await deriveAndMapPricingModelIdsForInserts(inserts, transaction)

  return baseBulkUpsertInvoiceLineItems(
    insertsWithPricingModelId,
    target,
    transaction
  )
}
