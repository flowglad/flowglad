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
} from '@/db/tableUtils'
import {
  Invoice,
  invoices,
  invoicesClientInsertSchema,
  invoicesClientUpdateSchema,
} from './invoices'
import { variants } from './variants'
import core from '@/utils/core'

export const TABLE_NAME = 'InvoiceLineItems'

export const invoiceLineItems = pgTable(
  TABLE_NAME,
  {
    ...tableBase('inv_li'),
    InvoiceId: notNullStringForeignKey('InvoiceId', invoices),
    quantity: integer('quantity').notNull(),
    VariantId: nullableStringForeignKey('VariantId', variants),
    description: text('description'),
    price: integer('price').notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.InvoiceId]),
      constructIndex(TABLE_NAME, [table.VariantId]),
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
  InvoiceId: true,
  VariantId: true,
} as const
const readonlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {} as const

const nonEditableColumns = {
  ...createOnlyColumns,
  ...readonlyColumns,
} as const

export const invoiceLineItemsClientInsertSchema =
  invoiceLineItemsInsertSchema.omit(readonlyColumns)

export const invoiceLineItemsClientUpdateSchema =
  invoiceLineItemsUpdateSchema.omit(nonEditableColumns)

export const invoiceLineItemsClientSelectSchema =
  invoiceLineItemsSelectSchema.omit(hiddenColumns)

export const invoiceLineItemsPaginatedSelectSchema =
  createPaginatedSelectSchema(invoiceLineItemsClientSelectSchema)

export const invoiceLineItemsPaginatedListSchema =
  createPaginatedListQuerySchema<
    z.infer<typeof invoiceLineItemsClientSelectSchema>
  >(invoiceLineItemsClientSelectSchema)

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
})

export type EditInvoiceInput = z.infer<typeof editInvoiceSchema>

export const sendInvoiceReminderSchema = z.object({
  invoiceId: z.string(),
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export type InvoiceWithLineItems = Invoice.Record & {
  invoiceLineItems: InvoiceLineItem.Record[]
}

export type ClientInvoiceWithLineItems = Invoice.ClientRecord & {
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
}
