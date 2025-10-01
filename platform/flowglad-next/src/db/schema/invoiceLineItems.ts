import * as R from 'ramda'
import { pgTable, integer, text, pgPolicy } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import {
  tableBase,
  constructIndex,
  nullableStringForeignKey,
  notNullStringForeignKey,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
  clientWriteOmitsConstructor,
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
import { billingRuns } from './billingRuns'
import { ledgerAccounts } from './ledgerAccounts'
import { SubscriptionItemType } from '@/types'
import { sql } from 'drizzle-orm'

export const TABLE_NAME = 'invoice_line_items'

const STATIC_INVOICE_LINE_ITEM_DESCRIPTION =
  'A static invoice line item, representing a fixed fee component of an invoice.'
const USAGE_INVOICE_LINE_ITEM_DESCRIPTION =
  'A usage-based invoice line item, where charges are based on recorded usage events.'
const INVOICE_LINE_ITEM_SELECT_SCHEMA_DESCRIPTION =
  'An invoice line item record, part of an invoice, detailing a specific product or service and its pricing terms. Can be static or usage-based.'
const INVOICE_LINE_ITEM_INSERT_SCHEMA_DESCRIPTION =
  'A new invoice line item.'
const INVOICE_LINE_ITEM_UPDATE_SCHEMA_DESCRIPTION =
  'Schema for updating an existing invoice line item.'

export const invoiceLineItems = pgTable(
  TABLE_NAME,
  {
    ...tableBase('inv_li'),
    invoiceId: notNullStringForeignKey('invoice_id', invoices),
    quantity: integer('quantity').notNull(),
    priceId: nullableStringForeignKey('price_id', prices),
    description: text('description'),
    price: integer('price').notNull(),
    billingRunId: nullableStringForeignKey(
      'billing_run_id',
      billingRuns
    ),
    ledgerAccountId: nullableStringForeignKey(
      'ledger_account_id',
      ledgerAccounts
    ),
    ledgerAccountCredit: integer('ledger_account_credit'),
    type: pgEnumColumn({
      enumName: 'SubscriptionItemType',
      columnName: 'type',
      enumBase: SubscriptionItemType,
    }).notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.invoiceId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      constructIndex(TABLE_NAME, [table.billingRunId]),
      constructIndex(TABLE_NAME, [table.ledgerAccountId]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"invoice_id" in (select "id" from "invoices")`,
        }
      ),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const baseColumnRefinements = {
  quantity: core.safeZodPositiveInteger,
  type: core.createSafeZodEnum(SubscriptionItemType),
}

const staticInvoiceLineItemColumnRefinements = {
  ledgerAccountId: z.null(),
  ledgerAccountCredit: z.null(),
}

/**
 * Usage invoice line item column refinements
 * must have a billing run id,
 * and target ledger account + credit ids
 * otherwise we have no way to determine how to map
 * the invoice line item to the correct ledger account
 * and credit amount
 */
const usageInvoiceLineItemColumnRefinements = {
  billingRunId: z.string(),
  ledgerAccountId: z.string(),
  ledgerAccountCredit: z.number(),
}

const baseInvoiceLineItemSelectSchema = createSelectSchema(
  invoiceLineItems,
  baseColumnRefinements
)

// Static Invoice Line Item Schemas
export const staticInvoiceLineItemSelectSchema =
  baseInvoiceLineItemSelectSchema
    .extend({
      type: z.literal(SubscriptionItemType.Static),
      ...staticInvoiceLineItemColumnRefinements,
    })
    .describe(STATIC_INVOICE_LINE_ITEM_DESCRIPTION)

export const staticInvoiceLineItemInsertSchema =
  staticInvoiceLineItemSelectSchema
    .omit(ommittedColumnsForInsertSchema)
    .describe(STATIC_INVOICE_LINE_ITEM_DESCRIPTION)

export const staticInvoiceLineItemUpdateSchema =
  staticInvoiceLineItemInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(SubscriptionItemType.Static), // Type cannot be changed
      ledgerAccountId: z.null(),
      ledgerAccountCredit: z.null(),
    })
    .describe(STATIC_INVOICE_LINE_ITEM_DESCRIPTION)

// Usage Invoice Line Item Schemas
export const usageInvoiceLineItemSelectSchema =
  baseInvoiceLineItemSelectSchema
    .extend({
      type: z.literal(SubscriptionItemType.Usage),
      ...usageInvoiceLineItemColumnRefinements,
    })
    .describe(USAGE_INVOICE_LINE_ITEM_DESCRIPTION)

export const usageInvoiceLineItemInsertSchema =
  usageInvoiceLineItemSelectSchema
    .omit(ommittedColumnsForInsertSchema)
    .describe(USAGE_INVOICE_LINE_ITEM_DESCRIPTION)

export const usageInvoiceLineItemUpdateSchema =
  usageInvoiceLineItemInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(SubscriptionItemType.Usage), // Type cannot be changed
      ...usageInvoiceLineItemColumnRefinements,
    })
    .describe(USAGE_INVOICE_LINE_ITEM_DESCRIPTION)

export const invoiceLineItemsInsertSchema = z
  .discriminatedUnion('type', [
    staticInvoiceLineItemInsertSchema,
    usageInvoiceLineItemInsertSchema,
  ])
  .describe(INVOICE_LINE_ITEM_INSERT_SCHEMA_DESCRIPTION)

export const invoiceLineItemsSelectSchema = z
  .discriminatedUnion('type', [
    staticInvoiceLineItemSelectSchema,
    usageInvoiceLineItemSelectSchema,
  ])
  .describe(INVOICE_LINE_ITEM_SELECT_SCHEMA_DESCRIPTION)

export const invoiceLineItemsUpdateSchema = z
  .discriminatedUnion('type', [
    staticInvoiceLineItemUpdateSchema,
    usageInvoiceLineItemUpdateSchema,
  ])
  .describe(INVOICE_LINE_ITEM_UPDATE_SCHEMA_DESCRIPTION)

const createOnlyColumns = {
  invoiceId: true,
} as const

const readOnlyColumns = {
  livemode: true,
  ledgerAccountId: true,
  billingRunId: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
  ledgerAccountCredit: true,
  ledgerAccountId: true,
  billingRunId: true,
} as const

const clientNonEditableColumns = clientWriteOmitsConstructor({
  ...hiddenColumns,
  ...readOnlyColumns,
  ...createOnlyColumns,
})

// Static Invoice Line Item Client Schemas
export const staticInvoiceLineItemClientInsertSchema =
  staticInvoiceLineItemInsertSchema
    .omit(clientNonEditableColumns)
    .meta({
      id: 'StaticInvoiceLineItemInsert',
    })
export const staticInvoiceLineItemClientUpdateSchema =
  staticInvoiceLineItemUpdateSchema
    .omit(clientNonEditableColumns)
    .meta({
      id: 'StaticInvoiceLineItemUpdate',
    })
export const staticInvoiceLineItemClientSelectSchema =
  staticInvoiceLineItemSelectSchema.omit(hiddenColumns).meta({
    id: 'StaticInvoiceLineItemRecord',
  })

// Usage Invoice Line Item Client Schemas
export const usageInvoiceLineItemClientInsertSchema =
  usageInvoiceLineItemInsertSchema
    .omit(clientNonEditableColumns)
    .meta({
      id: 'UsageInvoiceLineItemInsert',
    })
export const usageInvoiceLineItemClientUpdateSchema =
  usageInvoiceLineItemUpdateSchema
    .omit(clientNonEditableColumns)
    .meta({
      id: 'UsageInvoiceLineItemUpdate',
    })
export const usageInvoiceLineItemClientSelectSchema =
  usageInvoiceLineItemSelectSchema.omit(hiddenColumns).meta({
    id: 'UsageInvoiceLineItemRecord',
  })

// Client Discriminated Union Schemas
export const invoiceLineItemsClientInsertSchema = z
  .discriminatedUnion('type', [
    staticInvoiceLineItemClientInsertSchema,
    usageInvoiceLineItemClientInsertSchema,
  ])
  .meta({
    id: 'InvoiceLineItemInsert',
  })

export const invoiceLineItemsClientUpdateSchema = z
  .discriminatedUnion('type', [
    staticInvoiceLineItemClientUpdateSchema,
    usageInvoiceLineItemClientUpdateSchema,
  ])
  .meta({
    id: 'InvoiceLineItemUpdate',
  })

export const invoiceLineItemsClientSelectSchema = z
  .discriminatedUnion('type', [
    staticInvoiceLineItemClientSelectSchema,
    usageInvoiceLineItemClientSelectSchema,
  ])
  .meta({
    id: 'InvoiceLineItemRecord',
  })

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

  export type StaticInsert = z.infer<
    typeof staticInvoiceLineItemInsertSchema
  >
  export type StaticUpdate = z.infer<
    typeof staticInvoiceLineItemUpdateSchema
  >
  export type StaticRecord = z.infer<
    typeof staticInvoiceLineItemSelectSchema
  >

  export type UsageInsert = z.infer<
    typeof usageInvoiceLineItemInsertSchema
  >
  export type UsageUpdate = z.infer<
    typeof usageInvoiceLineItemUpdateSchema
  >
  export type UsageRecord = z.infer<
    typeof usageInvoiceLineItemSelectSchema
  >

  export type ClientStaticInsert = z.infer<
    typeof staticInvoiceLineItemClientInsertSchema
  >
  export type ClientStaticUpdate = z.infer<
    typeof staticInvoiceLineItemClientUpdateSchema
  >
  export type ClientStaticRecord = z.infer<
    typeof staticInvoiceLineItemClientSelectSchema
  >

  export type ClientUsageInsert = z.infer<
    typeof usageInvoiceLineItemClientInsertSchema
  >
  export type ClientUsageUpdate = z.infer<
    typeof usageInvoiceLineItemClientUpdateSchema
  >
  export type ClientUsageRecord = z.infer<
    typeof usageInvoiceLineItemClientSelectSchema
  >

  export type Where = SelectConditions<typeof invoiceLineItems>
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
