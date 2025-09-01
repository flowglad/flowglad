import {
  boolean,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  ommittedColumnsForInsertSchema,
  constructIndex,
  notNullStringForeignKey,
  newBaseZodSelectSchemaColumns,
  tableBase,
  livemodePolicy,
  metadataSchema,
  SelectConditions,
  hiddenColumnsForClientSchema,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import {
  Customer,
  customerClientSelectSchema,
  customers,
  customersSelectSchema,
} from '@/db/schema/customers'
import { organizations } from '@/db/schema/organizations'
import { prices } from '@/db/schema/prices'
import {
  Product,
  productsClientSelectSchema,
} from '@/db/schema/products'
import core from '@/utils/core'
import { z } from 'zod'
import { IntervalUnit, PriceType, PurchaseStatus } from '@/types'
import { subscriptionClientSelectSchema } from '@/db/schema/subscriptions'
import { subscriptionItemClientSelectSchema } from '@/db/schema/subscriptionItems'
import { sql } from 'drizzle-orm'

export const TABLE_NAME = 'purchases'

// Schema descriptions
const PURCHASES_BASE_DESCRIPTION =
  'A purchase record, which describes a transaction that can be associated with either a subscription or single payment price. Each purchase has a specific type that determines its behavior and required fields.'

const SUBSCRIPTION_PURCHASE_DESCRIPTION =
  'A purchase associated with a subscription price. This type of purchase will have recurring billing cycles and may include trial periods.'

const SINGLE_PAYMENT_PURCHASE_DESCRIPTION =
  'A purchase associated with a single payment price. This type of purchase is paid once and does not have recurring billing cycles.'

const USAGE_PURCHASE_DESCRIPTION =
  'A purchase associated with a usage price. This type of purchase is paid once and does not have recurring billing cycles.'

const columns = {
  ...tableBase('prch'),
  name: text('name').notNull(),
  status: pgEnumColumn({
    enumName: 'PurchaseStatus',
    columnName: 'status',
    enumBase: PurchaseStatus,
  }).default(PurchaseStatus.Open),
  customerId: notNullStringForeignKey('customer_id', customers),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  billingCycleAnchor: timestamp('billing_cycle_anchor'),
  /**
   * Billing fields
   */
  priceId: notNullStringForeignKey('price_id', prices),
  quantity: integer('quantity').notNull(),
  priceType: pgEnumColumn({
    enumName: 'PriceType',
    columnName: 'price_type',
    enumBase: PriceType,
  })
    .default(PriceType.SinglePayment)
    .notNull(),
  trialPeriodDays: integer('trial_period_days').default(0),
  pricePerBillingCycle: integer('price_per_billing_cycle'),
  intervalUnit: pgEnumColumn({
    enumName: 'IntervalUnit',
    columnName: 'interval_unit',
    enumBase: IntervalUnit,
  }),
  intervalCount: integer('interval_count'),
  firstInvoiceValue: integer('first_invoice_value'),
  totalPurchaseValue: integer('total_purchase_value'),
  bankPaymentOnly: boolean('bank_payment_only').default(false),
  purchaseDate: timestamp('purchase_date'),
  endDate: timestamp('end_date'),
  proposal: text('proposal'),
  archived: boolean('archived').default(false),
  billingAddress: jsonb('billing_address'),
  metadata: jsonb('metadata'),
}

export const purchases = pgTable(TABLE_NAME, columns, (table) => {
  return [
    constructIndex(TABLE_NAME, [table.customerId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.priceId]),
    livemodePolicy(),
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
        for: 'select',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }
    ),
    // constructIndex(TABLE_NAME, [
    //   table.stripeSetupIntentId,
    // ]),
    // constructUniqueIndex(TABLE_NAME, [
    //   table.stripePaymentIntentId,
    // ]),
  ]
}).enableRLS()

const zodSchemaEnhancementColumns = {
  quantity: core.safeZodPositiveInteger,
  status: core.createSafeZodEnum(PurchaseStatus),
  priceType: core.createSafeZodEnum(PriceType),
  metadata: metadataSchema.nullable().optional(),
}

const baseSelectSchema = createSelectSchema(purchases, {
  ...newBaseZodSelectSchemaColumns,
  ...zodSchemaEnhancementColumns,
})

const baseInsertSchema = createInsertSchema(purchases, {
  ...zodSchemaEnhancementColumns,
}).omit(ommittedColumnsForInsertSchema)

const nulledInstallmentColumns = {
  totalPurchaseValue: core.safeZodNullOrUndefined,
}

const subscriptionColumns = {
  priceType: z.literal(PriceType.Subscription),
  trialPeriodDays: core.safeZodPositiveIntegerOrZero,
  pricePerBillingCycle: core.safeZodPositiveInteger,
  intervalUnit: core.createSafeZodEnum(IntervalUnit),
  intervalCount: core.safeZodPositiveInteger,
  firstInvoiceValue: core.safeZodPositiveIntegerOrZero,
}

const nulledSubscriptionColumns = {
  pricePerBillingCycle: core.safeZodNullOrUndefined,
  intervalUnit: core.safeZodNullOrUndefined,
  intervalCount: core.safeZodNullOrUndefined,
  trialPeriodDays: core.safeZodNullOrUndefined,
}

export const subscriptionPurchaseInsertSchema = baseInsertSchema
  .extend(subscriptionColumns)
  .extend(nulledInstallmentColumns)
  .describe(SUBSCRIPTION_PURCHASE_DESCRIPTION)

export const subscriptionPurchaseUpdateSchema =
  subscriptionPurchaseInsertSchema
    .partial()
    .extend({
      id: z.string(),
      priceType: z.literal(PriceType.Subscription),
    })
    .describe(SUBSCRIPTION_PURCHASE_DESCRIPTION)

const singlePaymentColumns = {
  ...nulledSubscriptionColumns,
  firstInvoiceValue: core.safeZodPositiveIntegerOrZero,
  totalPurchaseValue: core.safeZodPositiveIntegerOrZero,
  priceType: z.literal(PriceType.SinglePayment),
}

const usageColumns = {
  ...nulledSubscriptionColumns,
  firstInvoiceValue: core.safeZodPositiveIntegerOrZero,
  totalPurchaseValue: core.safeZodPositiveIntegerOrZero,
  priceType: z.literal(PriceType.Usage),
}

export const singlePaymentPurchaseInsertSchema = baseInsertSchema
  .extend(singlePaymentColumns)
  .describe(SINGLE_PAYMENT_PURCHASE_DESCRIPTION)

export const usagePurchaseInsertSchema = baseInsertSchema
  .extend(usageColumns)
  .describe(USAGE_PURCHASE_DESCRIPTION)

export const purchasesInsertSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseInsertSchema,
    singlePaymentPurchaseInsertSchema,
    usagePurchaseInsertSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

export const subscriptionPurchaseSelectSchema = baseSelectSchema
  .extend(subscriptionColumns)
  .extend(nulledInstallmentColumns)
  .describe(SUBSCRIPTION_PURCHASE_DESCRIPTION)

export const singlePaymentPurchaseSelectSchema = baseSelectSchema
  .extend(singlePaymentColumns)
  .describe(SINGLE_PAYMENT_PURCHASE_DESCRIPTION)

export const usagePurchaseSelectSchema = baseSelectSchema
  .extend(usageColumns)
  .describe(USAGE_PURCHASE_DESCRIPTION)

const singlePaymentPurchaseUpdateSchema =
  singlePaymentPurchaseInsertSchema
    .partial()
    .extend({
      id: z.string(),
      priceType: z.literal(PriceType.SinglePayment),
    })
    .describe(SINGLE_PAYMENT_PURCHASE_DESCRIPTION)

const usagePurchaseUpdateSchema = singlePaymentPurchaseUpdateSchema
  .extend({
    priceType: z.literal(PriceType.Usage),
  })
  .describe(USAGE_PURCHASE_DESCRIPTION)

export const purchasesUpdateSchema = z.union([
  subscriptionPurchaseUpdateSchema,
  singlePaymentPurchaseUpdateSchema,
  usagePurchaseUpdateSchema,
])

export const purchasesSelectSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseSelectSchema,
    singlePaymentPurchaseSelectSchema,
    usagePurchaseSelectSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

// Client Subscription Schemas
export const subscriptionPurchaseClientInsertSchema =
  subscriptionPurchaseInsertSchema
    .omit({
      billingAddress: true,
    })
    .meta({
      id: 'SubscriptionPurchaseInsert',
    })

const hiddenColumns = {
  ...hiddenColumnsForClientSchema,
} as const

const clientWriteOmits = {
  billingAddress: true,
  organizationId: true,
  livemode: true,
} as const

export const subscriptionPurchaseClientUpdateSchema =
  subscriptionPurchaseUpdateSchema.omit(clientWriteOmits).meta({
    id: 'SubscriptionPurchaseUpdate',
  })

export const subscriptionPurchaseClientSelectSchema =
  subscriptionPurchaseSelectSchema.omit(hiddenColumns).meta({
    id: 'SubscriptionPurchaseRecord',
  })

// Client Single Payment Schemas
export const singlePaymentPurchaseClientInsertSchema =
  singlePaymentPurchaseInsertSchema.omit(clientWriteOmits).meta({
    id: 'SinglePaymentPurchaseInsert',
  })

export const usagePurchaseClientInsertSchema =
  usagePurchaseInsertSchema.omit(clientWriteOmits).meta({
    id: 'UsagePurchaseInsert',
  })

export const singlePaymentPurchaseClientUpdateSchema =
  singlePaymentPurchaseUpdateSchema.omit(clientWriteOmits).meta({
    id: 'SinglePaymentPurchaseUpdate',
  })

export const usagePurchaseClientUpdateSchema =
  usagePurchaseUpdateSchema
    .omit(clientWriteOmits)
    .meta({
      id: 'UsagePurchaseUpdate',
    })
    .describe(USAGE_PURCHASE_DESCRIPTION)

export const singlePaymentPurchaseClientSelectSchema =
  singlePaymentPurchaseSelectSchema.omit(hiddenColumns).meta({
    id: 'SinglePaymentPurchaseRecord',
  })

export const usagePurchaseClientSelectSchema =
  singlePaymentPurchaseSelectSchema
    .extend({
      priceType: z.literal(PriceType.Usage),
    })
    .omit(hiddenColumns)
    .meta({
      id: 'UsagePurchaseRecord',
    })
    .describe(USAGE_PURCHASE_DESCRIPTION)

// Combined Client Schemas
export const purchaseClientInsertSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseClientInsertSchema,
    singlePaymentPurchaseClientInsertSchema,
    usagePurchaseClientInsertSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)
  .meta({
    id: 'PurchaseInsert',
  })

export const purchaseClientUpdateSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseClientUpdateSchema,
    singlePaymentPurchaseClientUpdateSchema,
    usagePurchaseClientUpdateSchema,
  ])
  .meta({
    id: 'PurchaseUpdate',
  })
  .describe(PURCHASES_BASE_DESCRIPTION)

export const purchaseClientSelectSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseClientSelectSchema,
    singlePaymentPurchaseClientSelectSchema,
    usagePurchaseClientSelectSchema,
  ])
  .meta({
    id: 'PurchaseRecord',
  })
  .describe(PURCHASES_BASE_DESCRIPTION)

export const purchasesTableRowDataSchema = z.object({
  purchase: purchaseClientSelectSchema,
  product: productsClientSelectSchema,
  customer: customerClientSelectSchema,
  revenue: z.number().optional(),
})

export namespace Purchase {
  export type UsagePurchaseInsert = z.infer<
    typeof usagePurchaseInsertSchema
  >

  export type SubscriptionPurchaseInsert = z.infer<
    typeof subscriptionPurchaseInsertSchema
  >

  export type SinglePaymentPurchaseInsert = z.infer<
    typeof singlePaymentPurchaseInsertSchema
  >

  export type Insert = z.infer<typeof purchasesInsertSchema>

  export type SubscriptionPurchaseUpdate = z.infer<
    typeof subscriptionPurchaseUpdateSchema
  >

  export type SinglePaymentPurchaseUpdate = z.infer<
    typeof singlePaymentPurchaseUpdateSchema
  >

  export type Update = z.infer<typeof purchasesUpdateSchema>

  export type SubscriptionPurchaseRecord = z.infer<
    typeof subscriptionPurchaseSelectSchema
  >

  export type SinglePaymentPurchaseRecord = z.infer<
    typeof singlePaymentPurchaseSelectSchema
  >

  export type UsagePurchaseRecord = z.infer<
    typeof usagePurchaseSelectSchema
  >

  export type Record = z.infer<typeof purchasesSelectSchema>

  export type SubscriptionPurchaseClientInsert = z.infer<
    typeof subscriptionPurchaseClientInsertSchema
  >

  export type SubscriptionPurchaseClientRecord = z.infer<
    typeof subscriptionPurchaseClientSelectSchema
  >

  export type SubscriptionPurchaseClientUpdate = z.infer<
    typeof subscriptionPurchaseClientUpdateSchema
  >

  export type SinglePaymentPurchaseClientInsert = z.infer<
    typeof singlePaymentPurchaseClientInsertSchema
  >

  export type SinglePaymentPurchaseClientUpdate = z.infer<
    typeof singlePaymentPurchaseClientUpdateSchema
  >

  export type SinglePaymentPurchaseClientRecord = z.infer<
    typeof singlePaymentPurchaseClientSelectSchema
  >
  export type UsagePurchaseClientRecord = z.infer<
    typeof usagePurchaseClientSelectSchema
  >
  export type UsagePurchaseClientInsert = z.infer<
    typeof usagePurchaseClientInsertSchema
  >
  export type UsagePurchaseClientUpdate = z.infer<
    typeof usagePurchaseClientUpdateSchema
  >
  // Client Types
  export type ClientInsert = z.infer<
    typeof purchaseClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof purchaseClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof purchaseClientSelectSchema
  >

  export type Where = SelectConditions<typeof purchases>

  export type PurchaseTableRowData = z.infer<
    typeof purchasesTableRowDataSchema
  >
}

// Update form schemas to use client versions
export const createPurchaseFormSchema = z.object({
  purchase: purchaseClientInsertSchema,
})

export const editPurchaseFormSchema = z.object({
  purchase: purchaseClientUpdateSchema,
})

export const createCustomerOutputSchema = z.object({
  data: z.object({
    customer: customerClientSelectSchema,
    subscription: subscriptionClientSelectSchema.optional(),
    subscriptionItems: z
      .array(subscriptionItemClientSelectSchema)
      .optional(),
  }),
})

export type CreateCustomerOutputSchema = z.infer<
  typeof createCustomerOutputSchema
>
