import * as R from 'ramda'
import {
  boolean,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  taxColumns,
  taxSchemaColumns,
  tableBase,
  constructIndex,
  constructUniqueIndex,
  notNullStringForeignKey,
  livemodePolicy,
  nullableStringForeignKey,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
  timestampWithTimezoneColumn,
  zodEpochMs,
} from '@/db/tableUtils'
import { purchases } from './purchases'
import {
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  CurrencyCode,
} from '@/types'
import core, { safeZodNullOrUndefined } from '@/utils/core'
import { customers } from './customers'
import { organizations } from './organizations'
import { billingPeriods } from './billingPeriods'
import { memberships } from './memberships'
import { subscriptions } from './subscriptions'
import { billingRuns } from './billingRuns'
import { currencyCodeSchema } from '@/db/commonZodSchema'
import { sql } from 'drizzle-orm'

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
  },
  (table) => {
    return [
      constructUniqueIndex(TABLE_NAME, [table.invoiceNumber]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.customerId]),
      constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.billingRunId]),
      livemodePolicy(TABLE_NAME),
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
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
    ]
  }
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
  invoiceDate: zodEpochMs,
  dueDate: zodEpochMs,
  billingPeriodStartDate: zodEpochMs,
  billingPeriodEndDate: zodEpochMs,
  ...taxSchemaColumns,
  taxType: taxSchemaColumns.taxType.nullable().optional(),
  taxCountry: taxSchemaColumns.taxCountry.nullable().optional(),
}

const coreInvoicesInsertSchema = createInsertSchema(invoices)
  .omit(ommittedColumnsForInsertSchema)
  .extend(refineColumns)
  .extend({
    invoiceDate: refineColumns.invoiceDate.optional(),
    dueDate: refineColumns.dueDate.optional(),
  })

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
).extend({
  taxCountry: taxSchemaColumns.taxCountry.nullable().optional(),
})

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

const coreInvoicesUpdateSchema = coreInvoicesInsertSchema
  .partial()
  .extend({ id: z.string() })

export const purchaseInvoiceUpdateSchema = coreInvoicesUpdateSchema
  .partial()
  .extend(purchaseInvoiceColumnExtensions)
  .extend({
    id: z.string(),
  })
  .describe(PURCHASE_INVOICE_DESCRIPTION)

export const subscriptionInvoiceUpdateSchema =
  coreInvoicesUpdateSchema
    .partial()
    .extend(subscriptionInvoiceColumnExtensions)
    .extend({
      id: z.string(),
    })
    .describe(SUBSCRIPTION_INVOICE_DESCRIPTION)

export const standaloneInvoiceUpdateSchema = coreInvoicesUpdateSchema
  .partial()
  .extend({
    id: z.string(),
  })
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
  purchaseInvoiceSelectSchema.omit(hiddenColumns).meta({
    id: 'PurchaseInvoiceRecord',
  })
export const subscriptionInvoiceClientSelectSchema =
  subscriptionInvoiceSelectSchema.omit(hiddenColumns).meta({
    id: 'SubscriptionInvoiceRecord',
  })
export const standaloneInvoiceClientSelectSchema =
  standaloneInvoiceSelectSchema.omit(hiddenColumns).meta({
    id: 'StandaloneInvoiceRecord',
  })

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

const clientWriteOmits = R.omit(['position'], {
  ...hiddenColumns,
  ...readOnlyColumns,
})

export const purchaseInvoiceClientInsertSchema =
  purchaseInvoiceInsertSchema.omit(clientWriteOmits).meta({
    id: 'PurchaseInvoiceInsert',
  })
export const subscriptionInvoiceClientInsertSchema =
  subscriptionInvoiceInsertSchema.omit(clientWriteOmits).meta({
    id: 'SubscriptionInvoiceInsert',
  })
export const standaloneInvoiceClientInsertSchema =
  standaloneInvoiceInsertSchema.omit(clientWriteOmits).meta({
    id: 'StandaloneInvoiceInsert',
  })

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

export const purchaseInvoiceClientUpdateSchema =
  purchaseInvoiceUpdateSchema.omit(clientWriteOmits).meta({
    id: 'PurchaseInvoiceUpdate',
  })
export const subscriptionInvoiceClientUpdateSchema =
  subscriptionInvoiceUpdateSchema.omit(clientWriteOmits).meta({
    id: 'SubscriptionInvoiceUpdate',
  })
export const standaloneInvoiceClientUpdateSchema =
  standaloneInvoiceUpdateSchema.omit(clientWriteOmits).meta({
    id: 'StandaloneInvoiceUpdate',
  })

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
