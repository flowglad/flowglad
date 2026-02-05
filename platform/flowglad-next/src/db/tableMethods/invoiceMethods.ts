import { InvoiceStatus } from '@db-core/enums'
import { type Customer, customers } from '@db-core/schema/customers'
import type { InvoiceLineItem } from '@db-core/schema/invoiceLineItems'
import { invoicesPaginatedTableRowDataSchema } from '@db-core/schema/invoiceLineItems'
import {
  type Invoice,
  invoices,
  invoicesInsertSchema,
  invoicesSelectSchema,
  invoicesUpdateSchema,
} from '@db-core/schema/invoices'
import {
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  NotFoundError,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import {
  and,
  count,
  eq,
  exists,
  ilike,
  inArray,
  or,
  sql,
} from 'drizzle-orm'
import * as R from 'ramda'
import {
  selectCustomerById,
  selectCustomers,
} from '@/db/tableMethods/customerMethods'
import { selectInvoiceLineItems } from '@/db/tableMethods/invoiceLineItemMethods'
import type { DbTransaction } from '@/db/types'
import { panic } from '@/errors'
import { derivePricingModelIdFromPurchase } from './purchaseMethods'
import { derivePricingModelIdFromSubscription } from './subscriptionMethods'

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

/**
 * Derives pricingModelId for an invoice with COALESCE logic.
 * Priority: subscription > purchase > customer
 * Used for invoice inserts.
 */
export const derivePricingModelIdForInvoice = async (
  data: {
    subscriptionId?: string | null
    purchaseId?: string | null
    customerId: string
  },
  transaction: DbTransaction
): Promise<string> => {
  // Try subscription first
  if (data.subscriptionId) {
    return await derivePricingModelIdFromSubscription(
      data.subscriptionId,
      transaction
    )
  }

  // Try purchase second
  if (data.purchaseId) {
    return await derivePricingModelIdFromPurchase(
      data.purchaseId,
      transaction
    )
  }

  // Fall back to customer
  const customerResult = await selectCustomerById(
    data.customerId,
    transaction
  )
  const customer = customerResult.unwrap()
  if (!customer.pricingModelId) {
    panic(
      `Customer ${data.customerId} does not have a pricingModelId`
    )
  }
  return customer.pricingModelId
}

const baseInsertInvoice = createInsertFunction(invoices, config)

export const insertInvoice = async (
  invoiceInsert: Invoice.Insert,
  transaction: DbTransaction
): Promise<Invoice.Record> => {
  const pricingModelId = invoiceInsert.pricingModelId
    ? invoiceInsert.pricingModelId
    : await derivePricingModelIdForInvoice(
        {
          subscriptionId: invoiceInsert.subscriptionId,
          purchaseId: invoiceInsert.purchaseId,
          customerId: invoiceInsert.customerId,
        },
        transaction
      )
  return baseInsertInvoice(
    {
      ...invoiceInsert,
      pricingModelId,
    },
    transaction
  )
}

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
    panic(
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

      const [customerRecords, invoiceLineItems] = await Promise.all([
        selectCustomers({ id: customerIds }, transaction),
        selectInvoiceLineItems(
          { invoiceId: invoiceIds },
          transaction
        ),
      ])

      const customersById = new Map(
        customerRecords.map((customer: Customer.Record) => [
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
    // searchableColumns: undefined (no direct column search)
    undefined,
    /**
     * Additional search clause handler for invoices table.
     * Enables searching invoices by:
     * - Exact invoice ID match
     * - Exact invoice number match
     * - Customer name (case-insensitive partial match via ILIKE)
     *
     * The `exists()` function wraps a subquery and returns a boolean condition:
     * - Returns `true` if the subquery finds at least one matching row
     * - Returns `false` if the subquery finds zero matching rows
     * The database optimizes EXISTS subqueries to stop evaluating as soon as it finds
     * the first matching row, making it efficient for existence checks without needing JOINs.
     *
     * @param searchQuery - The search query string from the user
     * @param transaction - Database transaction for building subqueries
     * @returns SQL condition for OR-ing with other search filters, or undefined if query is empty
     */
    ({ searchQuery, transaction }) => {
      // Normalize the search query by trimming whitespace
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      // Only apply search filter if query is non-empty
      if (!trimmedQuery) return undefined

      // IMPORTANT: Do NOT await this query. By not awaiting, we keep it as a query builder
      // object that Drizzle can embed into the SQL as a subquery. If we await it, it would
      // execute immediately and return data, which we can't use in the EXISTS clause.
      const customerSubquery = transaction
        .select({ id: sql`1` })
        .from(customers)
        .where(
          and(
            eq(customers.id, invoices.customerId),
            ilike(customers.name, sql`'%' || ${trimmedQuery} || '%'`)
          )
        )
        // LIMIT 1 is included for clarity - EXISTS automatically stops after finding the first matching row.
        .limit(1)

      return or(
        // Match invoices by exact ID
        eq(invoices.id, trimmedQuery),
        // Match invoices by exact invoice number
        eq(invoices.invoiceNumber, trimmedQuery),
        // Match invoices where customer name contains the search query
        // The exists() function checks if the customerSubquery returns at least one row
        exists(customerSubquery)
      )
    }
  )
