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
  CustomerProfile,
  customerProfileClientSelectSchema,
  customerProfiles,
  customerProfilesSelectSchema,
} from '@/db/schema/customerProfiles'
import { organizations } from '@/db/schema/organizations'
import { variants } from '@/db/schema/variants'
import core from '@/utils/core'
import { z } from 'zod'
import { IntervalUnit, PriceType, PurchaseStatus } from '@/types'
import { Product } from './products'

export const PURCHASES_TABLE_NAME = 'purchases'

const columns = {
  ...tableBase('prch'),
  name: text('name').notNull(),
  status: pgEnumColumn({
    enumName: 'PurchaseStatus',
    columnName: 'status',
    enumBase: PurchaseStatus,
  }).default(PurchaseStatus.Open),
  customerProfileId: notNullStringForeignKey(
    'customer_profile_id',
    customerProfiles
  ),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  billingCycleAnchor: timestamp('billing_cycle_anchor'),
  /**
   * Billing fields
   */
  variantId: notNullStringForeignKey('variant_id', variants),
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
}

export const purchases = pgTable(
  PURCHASES_TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(PURCHASES_TABLE_NAME, [table.customerProfileId]),
      constructIndex(PURCHASES_TABLE_NAME, [table.organizationId]),
      constructIndex(PURCHASES_TABLE_NAME, [table.variantId]),
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

export const subscriptionPurchaseUpdateSchema =
  subscriptionPurchaseInsertSchema.partial().extend({
    id: z.string(),
  })

const singlePaymentColumns = {
  ...nulledSubscriptionColumns,
  firstInvoiceValue: core.safeZodPositiveIntegerOrZero,
  totalPurchaseValue: core.safeZodPositiveIntegerOrZero,
  priceType: z.literal(PriceType.SinglePayment),
}

export const singlePaymentPurchaseInsertSchema =
  baseInsertSchema.extend(singlePaymentColumns)

export const purchasesInsertSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionPurchaseInsertSchema,
    singlePaymentPurchaseInsertSchema,
  ]
)

export const subscriptionPurchaseSelectSchema = baseSelectSchema
  .extend(subscriptionColumns)
  .extend(nulledInstallmentColumns)

export const singlePaymentPurchaseSelectSchema =
  baseSelectSchema.extend(singlePaymentColumns)

const singlePaymentPurchaseUpdateSchema =
  singlePaymentPurchaseInsertSchema.partial().extend({
    id: z.string(),
  })

export const purchasesUpdateSchema = z.union([
  subscriptionPurchaseUpdateSchema,
  singlePaymentPurchaseUpdateSchema,
])

export const purchasesSelectSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionPurchaseSelectSchema,
    singlePaymentPurchaseSelectSchema,
  ]
)

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

export const singlePaymentPurchaseClientUpdateSchema =
  singlePaymentPurchaseUpdateSchema.omit(clientWriteOmits)

export const singlePaymentPurchaseClientSelectSchema =
  singlePaymentPurchaseSelectSchema.omit(clientSelectOmits)

// Combined Client Schemas
export const purchaseClientInsertSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionPurchaseClientInsertSchema,
    singlePaymentPurchaseClientInsertSchema,
  ]
)

export const purchaseClientUpdateSchema = z.union([
  subscriptionPurchaseClientUpdateSchema,
  singlePaymentPurchaseClientUpdateSchema,
])

export const purchaseClientSelectSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionPurchaseClientSelectSchema,
    singlePaymentPurchaseClientSelectSchema,
  ]
)

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
    customerProfile: CustomerProfile.ClientRecord
  }
}

// Update form schemas to use client versions
export const createPurchaseFormSchema = z.object({
  purchase: purchaseClientInsertSchema,
})

export const editPurchaseFormSchema = z.object({
  purchase: purchaseClientUpdateSchema,
})

export const createCustomerProfileOutputSchema = z.object({
  data: z.object({
    customerProfile: customerProfileClientSelectSchema,
  }),
})

export type CreateCustomerProfileOutputSchema = z.infer<
  typeof createCustomerProfileOutputSchema
>
