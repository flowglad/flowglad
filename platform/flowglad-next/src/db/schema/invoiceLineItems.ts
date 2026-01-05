import { sql } from 'drizzle-orm'
import { integer, pgPolicy, pgTable, text } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { SubscriptionItemType } from '@/types'
import core from '@/utils/core'
import { buildSchemas } from '../createZodSchemas'
import { billingRuns } from './billingRuns'
import { customerClientSelectSchema } from './customers'
import {
  Invoice,
  invoices,
  invoicesClientInsertSchema,
  invoicesClientSelectSchema,
  invoicesClientUpdateSchema,
  invoicesSelectSchema,
} from './invoices'
import { ledgerAccounts } from './ledgerAccounts'
import { prices } from './prices'
import { pricingModels } from './pricingModels'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.invoiceId]),
      constructIndex(TABLE_NAME, [table.priceId]),
      constructIndex(TABLE_NAME, [table.billingRunId]),
      constructIndex(TABLE_NAME, [table.ledgerAccountId]),
      constructIndex(TABLE_NAME, [table.pricingModelId]),
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
  type: z.literal(SubscriptionItemType.Static),
  ledgerAccountId: z.null().optional(),
  ledgerAccountCredit: z.null().optional(),
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
  type: z.literal(SubscriptionItemType.Usage),
  billingRunId: z.string(),
  ledgerAccountId: z.string(),
  ledgerAccountCredit: z.number(),
}

const createOnlyColumns = {
  invoiceId: true,
} as const

const readOnlyColumns = {
  ledgerAccountId: true,
  billingRunId: true,
  pricingModelId: true,
} as const

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
  ledgerAccountCredit: true,
  ledgerAccountId: true,
  billingRunId: true,
} as const

export const {
  select: staticInvoiceLineItemSelectSchema,
  insert: staticInvoiceLineItemInsertSchema,
  update: staticInvoiceLineItemUpdateSchema,
  client: {
    select: staticInvoiceLineItemClientSelectSchema,
    insert: staticInvoiceLineItemClientInsertSchema,
    update: staticInvoiceLineItemClientUpdateSchema,
  },
} = buildSchemas(invoiceLineItems, {
  discriminator: 'type',
  refine: staticInvoiceLineItemColumnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    createOnlyColumns,
    readOnlyColumns,
  },
  entityName: 'StaticInvoiceLineItem',
})

export const {
  select: usageInvoiceLineItemSelectSchema,
  insert: usageInvoiceLineItemInsertSchema,
  update: usageInvoiceLineItemUpdateSchema,
  client: {
    select: usageInvoiceLineItemClientSelectSchema,
    insert: usageInvoiceLineItemClientInsertSchema,
    update: usageInvoiceLineItemClientUpdateSchema,
  },
} = buildSchemas(invoiceLineItems, {
  refine: usageInvoiceLineItemColumnRefinements,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: { hiddenColumns, createOnlyColumns, readOnlyColumns },
  entityName: 'UsageInvoiceLineItem',
})

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
  invoiceLineItems: z
    .discriminatedUnion('type', [
      staticInvoiceLineItemClientInsertSchema.omit({
        invoiceId: true,
      }),
      usageInvoiceLineItemClientInsertSchema.omit({
        invoiceId: true,
      }),
    ])
    .array(),
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
