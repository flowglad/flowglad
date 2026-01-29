import { sql } from 'drizzle-orm'
import {
  boolean,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { currencyCodeSchema } from '../commonZodSchema'
import { buildSchemas } from '../createZodSchemas'
import {
  CurrencyCode,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
} from '../enums'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  taxColumns,
  taxSchemaColumns,
  timestampWithTimezoneColumn,
} from '../tableUtils'
import core, { safeZodNullOrUndefined } from '../utils'
import { billingPeriods } from './billingPeriods'
import { billingRuns } from './billingRuns'
import { customers } from './customers'
import { memberships } from './memberships'
import { organizations } from './organizations'
import { pricingModels } from './pricingModels'
import { purchases } from './purchases'
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
    invoiceDate: timestampWithTimezoneColumn('invoice_date')
      .notNull()
      .defaultNow(),
    billingPeriodId: nullableStringForeignKey(
      'billing_period_id',
      billingPeriods
    ),
    /**
     * If this is null, the invoice is due upon receipt
     */
    dueDate: timestampWithTimezoneColumn('due_date'),
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
    billingRunId: nullableStringForeignKey(
      'billing_run_id',
      billingRuns
    ),
    billingPeriodStartDate: timestampWithTimezoneColumn(
      'billing_period_start_date'
    ),
    billingPeriodEndDate: timestampWithTimezoneColumn(
      'billing_period_end_date'
    ),
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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructUniqueIndex(TABLE_NAME, [table.invoiceNumber]),
    constructIndex(TABLE_NAME, [table.purchaseId]),
    constructIndex(TABLE_NAME, [table.status]),
    constructIndex(TABLE_NAME, [table.customerId]),
    constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.billingRunId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"customer_id" in (select "id" from "customers")`,
      }
    ),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'all',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const refineColumns = {
  status: core.createSafeZodEnum(InvoiceStatus).meta({
    id: 'InvoiceStatus',
  }),
  type: core.createSafeZodEnum(InvoiceType).meta({
    id: 'InvoiceType',
  }),
  currency: currencyCodeSchema,
  receiptPdfURL: z.url().nullable().optional(),
  pdfURL: z.url().nullable().optional(),
  ...taxSchemaColumns,
  taxType: taxSchemaColumns.taxType.nullable().optional(),
  taxCountry: taxSchemaColumns.taxCountry.nullable().optional(),
}

const purchaseInvoiceColumnExtensions = {
  type: z.literal(InvoiceType.Purchase),
  purchaseId: z.string(),
  billingPeriodId: safeZodNullOrUndefined.optional(),
  subscriptionId: safeZodNullOrUndefined.optional(),
  billingPeriodStartDate: safeZodNullOrUndefined.optional(),
  billingPeriodEndDate: safeZodNullOrUndefined.optional(),
}

const subscriptionInvoiceColumnExtensions = {
  type: z.literal(InvoiceType.Subscription),
  purchaseId: safeZodNullOrUndefined,
  billingPeriodId: z.string(),
  subscriptionId: z.string(),
}

const standaloneInvoiceColumnExtensions = {
  type: z.literal(InvoiceType.Standalone),
  purchaseId: safeZodNullOrUndefined,
  billingPeriodId: safeZodNullOrUndefined,
  subscriptionId: safeZodNullOrUndefined,
  billingPeriodStartDate: safeZodNullOrUndefined.optional(),
  billingPeriodEndDate: safeZodNullOrUndefined.optional(),
}

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
  pricingModelId: true,
} as const

export const {
  insert: purchaseInvoiceInsertSchema,
  select: purchaseInvoiceSelectSchema,
  update: purchaseInvoiceUpdateSchema,
  client: {
    insert: purchaseInvoiceClientInsertSchema,
    select: purchaseInvoiceClientSelectSchema,
    update: purchaseInvoiceClientUpdateSchema,
  },
} = buildSchemas(invoices, {
  discriminator: 'type',
  refine: {
    ...refineColumns,
    ...purchaseInvoiceColumnExtensions,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'PurchaseInvoice',
})

export const {
  insert: subscriptionInvoiceInsertSchema,
  select: subscriptionInvoiceSelectSchema,
  update: subscriptionInvoiceUpdateSchema,
  client: {
    insert: subscriptionInvoiceClientInsertSchema,
    select: subscriptionInvoiceClientSelectSchema,
    update: subscriptionInvoiceClientUpdateSchema,
  },
} = buildSchemas(invoices, {
  discriminator: 'type',
  refine: {
    ...refineColumns,
    ...subscriptionInvoiceColumnExtensions,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'SubscriptionInvoice',
})

export const {
  insert: standaloneInvoiceInsertSchema,
  select: standaloneInvoiceSelectSchema,
  update: standaloneInvoiceUpdateSchema,
  client: {
    insert: standaloneInvoiceClientInsertSchema,
    select: standaloneInvoiceClientSelectSchema,
    update: standaloneInvoiceClientUpdateSchema,
  },
} = buildSchemas(invoices, {
  discriminator: 'type',
  refine: {
    ...refineColumns,
    ...standaloneInvoiceColumnExtensions,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  entityName: 'StandaloneInvoice',
})

export const invoicesInsertSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceInsertSchema,
    subscriptionInvoiceInsertSchema,
    standaloneInvoiceInsertSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesSelectSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceSelectSchema,
    subscriptionInvoiceSelectSchema,
    standaloneInvoiceSelectSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceUpdateSchema,
    subscriptionInvoiceUpdateSchema,
    standaloneInvoiceUpdateSchema,
  ])
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesClientSelectSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceClientSelectSchema,
    subscriptionInvoiceClientSelectSchema,
    standaloneInvoiceClientSelectSchema,
  ])
  .meta({
    id: 'InvoiceRecord',
  })
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesClientInsertSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceClientInsertSchema,
    subscriptionInvoiceClientInsertSchema,
    standaloneInvoiceClientInsertSchema,
  ])
  .meta({
    id: 'InvoiceInsert',
  })
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesClientUpdateSchema = z
  .discriminatedUnion('type', [
    purchaseInvoiceClientUpdateSchema,
    subscriptionInvoiceClientUpdateSchema,
    standaloneInvoiceClientUpdateSchema,
  ])
  .meta({
    id: 'InvoiceUpdate',
  })
  .describe(INVOICES_BASE_DESCRIPTION)

export const invoicesPaginatedSelectSchema =
  createPaginatedSelectSchema(purchaseInvoiceSelectSchema.partial())

export const invoicesPaginatedListSchema =
  createPaginatedListQuerySchema(invoicesClientSelectSchema)

export namespace Invoice {
  export type Insert = z.infer<typeof invoicesInsertSchema>
  export type Update = z.infer<typeof invoicesUpdateSchema>
  export type Record = z.infer<typeof invoicesSelectSchema>
  export type PurchaseInvoiceInsert = z.infer<
    typeof purchaseInvoiceInsertSchema
  >
  export type SubscriptionInvoiceInsert = z.infer<
    typeof subscriptionInvoiceInsertSchema
  >
  export type StandaloneInvoiceInsert = z.infer<
    typeof standaloneInvoiceInsertSchema
  >
  export type PurchaseInvoiceUpdate = z.infer<
    typeof purchaseInvoiceUpdateSchema
  >
  export type SubscriptionInvoiceUpdate = z.infer<
    typeof subscriptionInvoiceUpdateSchema
  >
  export type StandaloneInvoiceUpdate = z.infer<
    typeof standaloneInvoiceUpdateSchema
  >
  export type PurchaseInvoiceRecord = z.infer<
    typeof purchaseInvoiceSelectSchema
  >
  export type SubscriptionInvoiceRecord = z.infer<
    typeof subscriptionInvoiceSelectSchema
  >
  export type StandaloneInvoiceRecord = z.infer<
    typeof standaloneInvoiceSelectSchema
  >
  export type PurchaseInvoiceClientInsert = z.infer<
    typeof purchaseInvoiceClientInsertSchema
  >
  export type SubscriptionInvoiceClientInsert = z.infer<
    typeof subscriptionInvoiceClientInsertSchema
  >
  export type StandaloneInvoiceClientInsert = z.infer<
    typeof standaloneInvoiceClientInsertSchema
  >
  export type PurchaseInvoiceClientUpdate = z.infer<
    typeof purchaseInvoiceClientUpdateSchema
  >
  export type SubscriptionInvoiceClientUpdate = z.infer<
    typeof subscriptionInvoiceClientUpdateSchema
  >
  export type StandaloneInvoiceClientUpdate = z.infer<
    typeof standaloneInvoiceClientUpdateSchema
  >
  export type PurchaseInvoiceClientRecord = z.infer<
    typeof purchaseInvoiceClientSelectSchema
  >
  export type SubscriptionInvoiceClientRecord = z.infer<
    typeof subscriptionInvoiceClientSelectSchema
  >
  export type StandaloneInvoiceClientRecord = z.infer<
    typeof standaloneInvoiceClientSelectSchema
  >
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
