import * as R from 'ramda'
import {
  boolean,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  enhancedCreateInsertSchema,
  taxColumns,
  taxSchemaColumns,
  tableBase,
  constructIndex,
  constructUniqueIndex,
  createUpdateSchema,
  notNullStringForeignKey,
  livemodePolicy,
  nullableStringForeignKey,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { purchases } from './purchases'
import {
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  CurrencyCode,
} from '@/types'
import core from '@/utils/core'
import { customers } from './customers'
import { organizations } from './organizations'
import { billingPeriods } from './billingPeriods'
import { memberships } from './memberships'
import { subscriptions } from './subscriptions'

export const TABLE_NAME = 'invoices'

// Schema descriptions
const INVOICES_BASE_DESCRIPTION =
  'An invoice record, which describes a bill that can be associated with a purchase, subscription, or stand alone. Each invoice has a specific type that determines its behavior and required fields.'

const PURCHASE_INVOICE_DESCRIPTION =
  'An invoice created in association with a purchase. This type of invoice is only ever created for single payment prices. Purchases associated with subscriptions will have subscription invoices created instead.'

const SUBSCRIPTION_INVOICE_DESCRIPTION =
  'An invoice created in association with a subscription. This type of invoice is only ever created for subscription prices. Purchases associated with single payment prices will have purchase invoices created instead.'

const STANDALONE_INVOICE_DESCRIPTION =
  'An invoice created without any associated purchase or subscription. These invoices are most often created manually.'

export const invoices = pgTable(
  TABLE_NAME,
  {
    ...tableBase('inv'),
    purchaseId: nullableStringForeignKey('purchase_id', purchases),
    invoiceNumber: text('invoice_number').notNull().unique(),
    invoiceDate: timestamp('invoice_date').notNull().defaultNow(),
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    /**
     * If this is null, the invoice is due upon receipt
     */
    dueDate: timestamp('due_date'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    customerId: notNullStringForeignKey(
      'customer_id',
      customers
    ).notNull(),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    status: pgEnumColumn({
      enumName: 'InvoiceStatus',
      columnName: 'status',
      enumBase: InvoiceStatus,
    })
      .notNull()
      .default(InvoiceStatus.Draft),
    subscriptionId: nullableStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    billingPeriodStartDate: timestamp('billing_period_start_date'),
    billingPeriodEndDate: timestamp('billing_period_end_date'),
    ownerMembershipId: nullableStringForeignKey(
      'owner_membership_id',
      memberships
    ),
    pdfURL: text('pdf_url'),
    receiptPdfURL: text('receipt_pdf_url'),
    memo: text('memo'),
    bankPaymentOnly: boolean('bank_payment_only').default(false),
    type: pgEnumColumn({
      enumName: 'InvoiceType',
      columnName: 'type',
      enumBase: InvoiceType,
    }),
    currency: pgEnumColumn({
      enumName: 'CurrencyCode',
      columnName: 'currency',
      enumBase: CurrencyCode,
    }).notNull(),
    ...taxColumns(),
  },
  (table) => {
    return [
      constructUniqueIndex(TABLE_NAME, [table.invoiceNumber]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.customerId]),
      constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      livemodePolicy(),
    ]
  }
).enableRLS()

const refineColumns = {
  status: core.createSafeZodEnum(InvoiceStatus),
  type: core.createSafeZodEnum(InvoiceType),
  currency: core.createSafeZodEnum(CurrencyCode),
  receiptPdfURL: z.string().url().nullable(),
  pdfURL: z.string().url().nullable(),
  ...taxSchemaColumns,
}

const coreInvoicesInsertSchema = enhancedCreateInsertSchema(
  invoices,
  refineColumns
)

const purchaseInvoiceColumnExtensions = {
  type: z.literal(InvoiceType.Purchase),
  purchaseId: z.string(),
  billingPeriodId: z.null(),
  subscriptionId: z.null(),
}

const subscriptionInvoiceColumnExtensions = {
  type: z.literal(InvoiceType.Subscription),
  purchaseId: z.null(),
  billingPeriodId: z.string(),
  subscriptionId: z.string(),
}

const standaloneInvoiceColumnExtensions = {
  type: z.literal(InvoiceType.Standalone),
  purchaseId: z.null(),
  billingPeriodId: z.null(),
  subscriptionId: z.null(),
}

const purchaseInvoiceInsertSchema = coreInvoicesInsertSchema
  .extend(purchaseInvoiceColumnExtensions)
  .describe(PURCHASE_INVOICE_DESCRIPTION)

const subscriptionInvoiceInsertSchema = coreInvoicesInsertSchema
  .extend(subscriptionInvoiceColumnExtensions)
  .describe(SUBSCRIPTION_INVOICE_DESCRIPTION)

const standaloneInvoiceInsertSchema = coreInvoicesInsertSchema
  .extend(standaloneInvoiceColumnExtensions)
  .describe(STANDALONE_INVOICE_DESCRIPTION)

export const invoicesInsertSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceInsertSchema,
    subscriptionInvoiceInsertSchema,
    standaloneInvoiceInsertSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

const coreInvoicesSelectSchema = createSelectSchema(
  invoices,
  refineColumns
)

export const purchaseInvoiceSelectSchema = coreInvoicesSelectSchema
  .extend(purchaseInvoiceColumnExtensions)
  .describe(PURCHASE_INVOICE_DESCRIPTION)

export const subscriptionInvoiceSelectSchema =
  coreInvoicesSelectSchema
    .extend(subscriptionInvoiceColumnExtensions)
    .describe(SUBSCRIPTION_INVOICE_DESCRIPTION)

export const standaloneInvoiceSelectSchema = coreInvoicesSelectSchema
  .extend(standaloneInvoiceColumnExtensions)
  .describe(STANDALONE_INVOICE_DESCRIPTION)

export const invoicesSelectSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceSelectSchema,
    subscriptionInvoiceSelectSchema,
    standaloneInvoiceSelectSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

const coreInvoicesUpdateSchema = createUpdateSchema(
  invoices,
  refineColumns
)

export const purchaseInvoiceUpdateSchema = coreInvoicesUpdateSchema
  .extend(purchaseInvoiceColumnExtensions)
  .describe(PURCHASE_INVOICE_DESCRIPTION)

export const subscriptionInvoiceUpdateSchema =
  coreInvoicesUpdateSchema
    .extend(subscriptionInvoiceColumnExtensions)
    .describe(SUBSCRIPTION_INVOICE_DESCRIPTION)

export const standaloneInvoiceUpdateSchema = coreInvoicesUpdateSchema
  .extend(standaloneInvoiceColumnExtensions)
  .describe(STANDALONE_INVOICE_DESCRIPTION)

export const invoicesUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceUpdateSchema,
    subscriptionInvoiceUpdateSchema,
    standaloneInvoiceUpdateSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

const hiddenColumns = {
  stripePaymentIntentId: true,
  stripeTaxCalculationId: true,
  stripeTaxTransactionId: true,
  ...hiddenColumnsForClientSchema,
} as const

const createOnlyColumns = {
  customerId: true,
  purchaseId: true,
} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  applicationFee: true,
  taxRatePercentage: true,
  taxAmount: true,
} as const

export const purchaseInvoiceClientSelectSchema =
  purchaseInvoiceSelectSchema.omit(hiddenColumns)
export const subscriptionInvoiceClientSelectSchema =
  subscriptionInvoiceSelectSchema.omit(hiddenColumns)
export const standaloneInvoiceClientSelectSchema =
  standaloneInvoiceSelectSchema.omit(hiddenColumns)

export const invoicesClientSelectSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceClientSelectSchema,
    subscriptionInvoiceClientSelectSchema,
    standaloneInvoiceClientSelectSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const purchaseInvoiceClientInsertSchema =
  purchaseInvoiceInsertSchema.omit(clientWriteOmits)
export const subscriptionInvoiceClientInsertSchema =
  subscriptionInvoiceInsertSchema.omit(clientWriteOmits)
export const standaloneInvoiceClientInsertSchema =
  standaloneInvoiceInsertSchema.omit(clientWriteOmits)

export const invoicesClientInsertSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceClientInsertSchema,
    subscriptionInvoiceClientInsertSchema,
    standaloneInvoiceClientInsertSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

export const purchaseInvoiceClientUpdateSchema =
  purchaseInvoiceUpdateSchema.omit(clientWriteOmits)
export const subscriptionInvoiceClientUpdateSchema =
  subscriptionInvoiceUpdateSchema.omit(clientWriteOmits)
export const standaloneInvoiceClientUpdateSchema =
  standaloneInvoiceUpdateSchema.omit(clientWriteOmits)

export const invoicesClientUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceClientUpdateSchema,
    subscriptionInvoiceClientUpdateSchema,
    standaloneInvoiceClientUpdateSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesPaginatedSelectSchema =
  createPaginatedSelectSchema(coreInvoicesSelectSchema.partial())

export const invoicesPaginatedListSchema =
  createPaginatedListQuerySchema(invoicesClientSelectSchema)

export namespace Invoice {
  export type Insert = z.infer<typeof invoicesInsertSchema>
  export type Update = z.infer<typeof invoicesUpdateSchema>
  export type Record = z.infer<typeof invoicesSelectSchema>
  export type ClientInsert = z.infer<
    typeof invoicesClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof invoicesClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof invoicesClientSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof invoicesPaginatedListSchema
  >
  export type Where = SelectConditions<typeof invoices>
}
