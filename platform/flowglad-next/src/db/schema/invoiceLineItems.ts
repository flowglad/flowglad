import * as R from 'ramda'
import { pgTable, integer, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import {
  enhancedCreateInsertSchema,
  tableBase,
  constructIndex,
  createUpdateSchema,
  nullableStringForeignKey,
  notNullStringForeignKey,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import {
  Invoice,
  invoices,
  invoicesClientInsertSchema,
  invoicesClientSelectSchema,
  invoicesClientUpdateSchema,
  invoicesSelectSchema,
} from './invoices'
import { prices } from './prices'
import core from '@/utils/core'
import { customerClientSelectSchema } from './customers'

export const TABLE_NAME = 'invoice_line_items'

export const invoiceLineItems = pgTable(
  TABLE_NAME,
  {
    ...tableBase('inv_li'),
    invoiceId: notNullStringForeignKey('invoice_id', invoices),
    quantity: integer('quantity').notNull(),
    priceId: nullableStringForeignKey('price_id', prices),
    description: text('description'),
    price: integer('price').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.invoiceId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnEnhancements = {
  quantity: core.safeZodPositiveInteger,
}

export const invoiceLineItemsInsertSchema =
  enhancedCreateInsertSchema(invoiceLineItems, columnEnhancements)

export const invoiceLineItemsSelectSchema = createSelectSchema(
  invoiceLineItems,
  columnEnhancements
)

export const invoiceLineItemsUpdateSchema = createUpdateSchema(
  invoiceLineItems,
  columnEnhancements
)

const createOnlyColumns = {
  id: true,
  invoiceId: true,
  priceId: true,
} as const

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const invoiceLineItemsClientInsertSchema =
  invoiceLineItemsInsertSchema.omit(clientWriteOmits)

export const invoiceLineItemsClientUpdateSchema =
  invoiceLineItemsUpdateSchema.omit(clientWriteOmits)

export const invoiceLineItemsClientSelectSchema =
  invoiceLineItemsSelectSchema.omit(hiddenColumns)

export const invoiceLineItemsPaginatedSelectSchema =
  createPaginatedSelectSchema(invoiceLineItemsClientSelectSchema)

export const invoiceLineItemsPaginatedListSchema =
  createPaginatedListQuerySchema(invoiceLineItemsClientSelectSchema)

export namespace InvoiceLineItem {
  export type Insert = z.infer<typeof invoiceLineItemsInsertSchema>
  export type Update = z.infer<typeof invoiceLineItemsUpdateSchema>
  export type Record = z.infer<typeof invoiceLineItemsSelectSchema>
  export type ClientInsert = z.infer<
    typeof invoiceLineItemsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof invoiceLineItemsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof invoiceLineItemsClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof invoiceLineItemsPaginatedListSchema
  >
}

// Add this new schema at the end of the file
export const createInvoiceSchema = z.object({
  invoice: invoicesClientInsertSchema,
  invoiceLineItems: invoiceLineItemsClientInsertSchema.array(),
  autoSend: z.boolean().optional(),
})

export const editInvoiceSchema = z.object({
  invoice: invoicesClientUpdateSchema,
  invoiceLineItems: z
    .union([
      invoiceLineItemsClientInsertSchema,
      invoiceLineItemsClientSelectSchema,
    ])
    .array(),
  id: z.string(),
})

export type EditInvoiceInput = z.infer<typeof editInvoiceSchema>

export const sendInvoiceReminderSchema = z.object({
  id: z.string(),
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export const invoiceWithLineItemsSchema = z.object({
  invoice: invoicesSelectSchema,
  invoiceLineItems: invoiceLineItemsSelectSchema.array(),
})

export const invoiceWithLineItemsClientSchema = z.object({
  invoice: invoicesClientSelectSchema,
  invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
})

export type InvoiceWithLineItems = z.infer<
  typeof invoiceWithLineItemsSchema
>

export type ClientInvoiceWithLineItems = z.infer<
  typeof invoiceWithLineItemsClientSchema
>

export const invoicesPaginatedTableRowDataSchema = z.object({
  invoice: invoicesClientSelectSchema,
  invoiceLineItems: invoiceLineItemsClientSelectSchema.array(),
  customer: customerClientSelectSchema,
})

export type InvoicesPaginatedTableRowData = z.infer<
  typeof invoicesPaginatedTableRowDataSchema
>
