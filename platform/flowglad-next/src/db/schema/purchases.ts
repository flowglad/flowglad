import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  makeSchemaPropNull,
  ommittedColumnsForInsertSchema,
  constructIndex,
  notNullStringForeignKey,
  newBaseZodSelectSchemaColumns,
  tableBase,
  livemodePolicy,
} from '@/db/tableUtils'
import {
  Customer,
  customerClientSelectSchema,
  customers,
  customersSelectSchema,
} from '@/db/schema/customers'
import { organizations } from '@/db/schema/organizations'
import { prices } from '@/db/schema/prices'
import core from '@/utils/core'
import { z } from 'zod'
import { IntervalUnit, PriceType, PurchaseStatus } from '@/types'
import { Product } from './products'

export const PURCHASES_TABLE_NAME = 'purchases'

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

export const purchases = pgTable(
  PURCHASES_TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(PURCHASES_TABLE_NAME, [table.customerId]),
      constructIndex(PURCHASES_TABLE_NAME, [table.organizationId]),
      constructIndex(PURCHASES_TABLE_NAME, [table.priceId]),
      livemodePolicy(),
      // constructIndex(PURCHASES_TABLE_NAME, [
      //   table.stripeSetupIntentId,
      // ]),
      // constructUniqueIndex(PURCHASES_TABLE_NAME, [
      //   table.stripePaymentIntentId,
      // ]),
    ]
  }
).enableRLS()

const zodSchemaEnhancementColumns = {
  quantity: core.safeZodPositiveInteger,
  status: core.createSafeZodEnum(PurchaseStatus),
  priceType: core.createSafeZodEnum(PriceType),
  metadata: z.record(z.string(), z.any()).nullable(),
}

const baseSelectSchema = createSelectSchema(purchases, {
  ...newBaseZodSelectSchemaColumns,
  ...zodSchemaEnhancementColumns,
})

const baseInsertSchema = createInsertSchema(purchases, {
  ...zodSchemaEnhancementColumns,
}).omit(ommittedColumnsForInsertSchema)

const nulledInstallmentColumns = {
  totalPurchaseValue: makeSchemaPropNull(z.any()),
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
  pricePerBillingCycle: makeSchemaPropNull(z.any()),
  intervalUnit: makeSchemaPropNull(z.any()),
  intervalCount: makeSchemaPropNull(z.any()),
  trialPeriodDays: makeSchemaPropNull(z.any()),
  stripesubscriptionId: makeSchemaPropNull(z.any()),
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
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

// Client Subscription Schemas
export const subscriptionPurchaseClientInsertSchema =
  subscriptionPurchaseInsertSchema
    .extend({
      stripePaymentIntentId: core.safeZodAlwaysNull,
      stripesubscriptionId: core.safeZodAlwaysNull,
    })
    .omit({
      billingAddress: true,
    })

const clientSelectOmits = {} as const

const clientWriteOmits = {
  billingAddress: true,
  organizationId: true,
  livemode: true,
} as const

export const subscriptionPurchaseClientUpdateSchema =
  subscriptionPurchaseUpdateSchema.omit(clientWriteOmits)

export const subscriptionPurchaseClientSelectSchema =
  subscriptionPurchaseSelectSchema.omit(clientSelectOmits)

// Client Single Payment Schemas
export const singlePaymentPurchaseClientInsertSchema =
  singlePaymentPurchaseInsertSchema.omit(clientWriteOmits)

export const usagePurchaseClientInsertSchema =
  usagePurchaseInsertSchema.omit(clientWriteOmits)

export const singlePaymentPurchaseClientUpdateSchema =
  singlePaymentPurchaseUpdateSchema.omit(clientWriteOmits)

export const usagePurchaseClientUpdateSchema =
  usagePurchaseUpdateSchema
    .omit(clientWriteOmits)
    .describe(USAGE_PURCHASE_DESCRIPTION)

export const singlePaymentPurchaseClientSelectSchema =
  singlePaymentPurchaseSelectSchema.omit(clientSelectOmits)

export const usagePurchaseClientSelectSchema =
  singlePaymentPurchaseSelectSchema
    .extend({
      priceType: z.literal(PriceType.Usage),
    })
    .omit(clientSelectOmits)
    .describe(USAGE_PURCHASE_DESCRIPTION)

// Combined Client Schemas
export const purchaseClientInsertSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseClientInsertSchema,
    singlePaymentPurchaseClientInsertSchema,
    usagePurchaseClientInsertSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

export const purchaseClientUpdateSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseClientUpdateSchema,
    singlePaymentPurchaseClientUpdateSchema,
    usagePurchaseClientUpdateSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

export const purchaseClientSelectSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseClientSelectSchema,
    singlePaymentPurchaseClientSelectSchema,
    usagePurchaseClientSelectSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

export namespace Purchase {
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

  export interface PurchaseTableRowData {
    purchase: Purchase.ClientRecord
    product: Product.ClientRecord
    customer: Customer.ClientRecord
  }
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
  }),
})

export type CreateCustomerOutputSchema = z.infer<
  typeof createCustomerOutputSchema
>
