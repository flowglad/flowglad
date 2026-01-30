import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { currencyCodeSchema } from '../commonZodSchema'
import { buildSchemas } from '../createZodSchemas'
import { IntervalUnit, PriceType, PurchaseStatus } from '../enums'
import {
  constructIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  metadataSchema,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  ommittedColumnsForInsertSchema,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '../tableUtils'
import core from '../utils'
import {
  Customer,
  customerClientSelectSchema,
  customers,
  customersSelectSchema,
} from './customers'
import { billingAddressSchema, organizations } from './organizations'
import { prices } from './prices'
import { pricingModels } from './pricingModels'
import { Product, productsClientSelectSchema } from './products'
import { subscriptionItemClientSelectSchema } from './subscriptionItems'
import { subscriptionClientSelectSchema } from './subscriptions'

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
  billingCycleAnchor: timestampWithTimezoneColumn(
    'billing_cycle_anchor'
  ),
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
  purchaseDate: timestampWithTimezoneColumn('purchase_date'),
  endDate: timestampWithTimezoneColumn('end_date'),
  proposal: text('proposal'),
  archived: boolean('archived').default(false),
  billingAddress: jsonb('billing_address'),
  metadata: jsonb('metadata'),
  pricingModelId: notNullStringForeignKey(
    'pricing_model_id',
    pricingModels
  ),
}

export const purchases = pgTable(
  TABLE_NAME,
  columns,
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.customerId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.priceId]),
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
        for: 'select',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
    // constructIndex(TABLE_NAME, [
    //   table.stripeSetupIntentId,
    // ]),
    // constructUniqueIndex(TABLE_NAME, [
    //   table.stripePaymentIntentId,
    // ]),
  ])
).enableRLS()

const refineColumns = {
  quantity: core.safeZodPositiveInteger,
  status: core.createSafeZodEnum(PurchaseStatus),
  priceType: core.createSafeZodEnum(PriceType),
  metadata: metadataSchema.nullable().optional(),
  billingAddress: billingAddressSchema.nullable().optional(),
}

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

export const {
  insert: subscriptionPurchaseInsertSchema,
  select: subscriptionPurchaseSelectSchema,
  update: subscriptionPurchaseUpdateSchema,
  client: {
    insert: subscriptionPurchaseClientInsertSchema,
    select: subscriptionPurchaseClientSelectSchema,
    update: subscriptionPurchaseClientUpdateSchema,
  },
} = buildSchemas(purchases, {
  discriminator: 'priceType',
  refine: {
    ...refineColumns,
    ...subscriptionColumns,
    ...nulledInstallmentColumns,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  selectRefine: {
    ...newBaseZodSelectSchemaColumns,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      // Keep billingAddress out of client writes entirely
      billingAddress: true,
      pricingModelId: true,
    },
    // Allow organizationId and livemode only on create, not update (matches previous behavior)
    createOnlyColumns: {
      organizationId: true,
      livemode: true,
    },
  },
  entityName: 'SubscriptionPurchase',
})

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

export const {
  insert: singlePaymentPurchaseInsertSchema,
  select: singlePaymentPurchaseSelectSchema,
  update: singlePaymentPurchaseUpdateSchema,
  client: {
    insert: singlePaymentPurchaseClientInsertSchema,
    select: singlePaymentPurchaseClientSelectSchema,
    update: singlePaymentPurchaseClientUpdateSchema,
  },
} = buildSchemas(purchases, {
  discriminator: 'priceType',
  refine: {
    ...refineColumns,
    ...singlePaymentColumns,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  selectRefine: {
    ...newBaseZodSelectSchemaColumns,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    // For single payment, these were previously omitted on both insert and update
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
      billingAddress: true,
      pricingModelId: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'SinglePaymentPurchase',
})

export const {
  insert: usagePurchaseInsertSchema,
  select: usagePurchaseSelectSchema,
  update: usagePurchaseUpdateSchema,
  client: {
    insert: usagePurchaseClientInsertSchema,
    select: usagePurchaseClientSelectSchema,
    update: usagePurchaseClientUpdateSchema,
  },
} = buildSchemas(purchases, {
  discriminator: 'priceType',
  refine: {
    ...refineColumns,
    ...usageColumns,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  selectRefine: {
    ...newBaseZodSelectSchemaColumns,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
      billingAddress: true,
      pricingModelId: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'UsagePurchase',
})

export const purchasesInsertSchema = z
  .discriminatedUnion('priceType', [
    subscriptionPurchaseInsertSchema,
    singlePaymentPurchaseInsertSchema,
    usagePurchaseInsertSchema,
  ])
  .describe(PURCHASES_BASE_DESCRIPTION)

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

// Client schemas are generated by buildSchemas above for each subtype

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
  // Product may be null for usage-based purchases
  product: productsClientSelectSchema.nullable(),
  customer: customerClientSelectSchema,
  revenue: z.number().optional(),
  currency: currencyCodeSchema,
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
