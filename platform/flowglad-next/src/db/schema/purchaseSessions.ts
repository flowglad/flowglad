import { z } from 'zod'
import {
  jsonb,
  pgPolicy,
  pgTable,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  tableBase,
  enhancedCreateInsertSchema,
  pgEnumColumn,
  constructIndex,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
  nullableStringForeignKey,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
} from '@/db/tableUtils'
import { billingAddressSchema } from '@/db/schema/customers'
import core from '@/utils/core'
import { variants } from './variants'
import {
  PaymentMethodType,
  PurchaseSessionStatus,
  PurchaseSessionType,
} from '@/types'
import { organizations } from './organizations'
import { purchases } from './purchases'
import { discounts } from './discounts'
import { customerProfiles } from './customerProfiles'
import { sql } from 'drizzle-orm'
import { invoices } from './invoices'

const TABLE_NAME = 'purchase_sessions'

const columns = {
  ...tableBase('pses'),
  status: pgEnumColumn({
    enumName: 'PurchaseSessionStatus',
    columnName: 'status',
    enumBase: PurchaseSessionStatus,
  }).notNull(),
  billingAddress: jsonb('billing_address'),
  variantId: nullableStringForeignKey('variant_id', variants),
  purchaseId: nullableStringForeignKey('purchase_id', purchases),
  invoiceId: nullableStringForeignKey('invoice_id', invoices),
  /**
   * Should only be non-1 in the case of variantId is not null.
   */
  quantity: integer('quantity').notNull().default(1),
  organizationId: notNullStringForeignKey(
    'organization_id',
    organizations
  ),
  customerName: text('customer_name'),
  customerEmail: text('customer_email'),
  stripeSetupIntentId: text('stripe_setup_intent_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  customerProfileId: nullableStringForeignKey(
    'customer_profile_id',
    customerProfiles
  ),
  /**
   * Default to 24 hours from now
   */
  expires: timestamp('expires')
    .notNull()
    .$defaultFn(() => new Date(Date.now() + 1000 * 60 * 60 * 24)),
  paymentMethodType: pgEnumColumn({
    enumName: 'PaymentMethodType',
    columnName: 'paymentMethodType',
    enumBase: PaymentMethodType,
  }),
  discountId: nullableStringForeignKey('discount_id', discounts),
  successUrl: text('successUrl'),
  cancelUrl: text('cancelUrl'),
  type: pgEnumColumn({
    enumName: 'PurchaseSessionType',
    columnName: 'type',
    enumBase: PurchaseSessionType,
  }).notNull(),
}

export const purchaseSessions = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.variantId]),
      constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.stripeSetupIntentId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.discountId]),
      constructIndex(TABLE_NAME, [table.customerProfileId]),
      livemodePolicy(),
      pgPolicy(
        'Enable all actions for discounts in own organization',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
    ]
  }
).enableRLS()

const refinement = {
  ...newBaseZodSelectSchemaColumns,
  billingAddress: billingAddressSchema.nullable(),
  status: core.createSafeZodEnum(PurchaseSessionStatus),
  successUrl: z.string().url().nullable(),
  cancelUrl: z.string().url().nullable(),
  paymentMethodType: core
    .createSafeZodEnum(PaymentMethodType)
    .nullable(),
}

const purchasePurchaseSessionRefinement = {
  purchaseId: z.string(),
  variantId: z.string(),
  type: z.literal(PurchaseSessionType.Purchase),
}

const invoicePurchaseSessionRefinement = {
  invoiceId: z.string(),
  variantId: z.null(),
  purchaseId: z.null(),
  type: z.literal(PurchaseSessionType.Invoice),
}

const productPurchaseSessionRefinement = {
  variantId: z.string(),
  invoiceId: z.null(),
  type: z.literal(PurchaseSessionType.Product),
}

export const corePurchaseSessionsSelectSchema = createSelectSchema(
  purchaseSessions,
  refinement
)

const purchasePurchaseSessionsSelectSchema =
  corePurchaseSessionsSelectSchema.extend(
    purchasePurchaseSessionRefinement
  )
const invoicePurchaseSessionsSelectSchema =
  corePurchaseSessionsSelectSchema.extend(
    invoicePurchaseSessionRefinement
  )
const productPurchaseSessionsSelectSchema =
  corePurchaseSessionsSelectSchema.extend(
    productPurchaseSessionRefinement
  )

export const purchaseSessionsSelectSchema = z.discriminatedUnion(
  'type',
  [
    purchasePurchaseSessionsSelectSchema,
    invoicePurchaseSessionsSelectSchema,
    productPurchaseSessionsSelectSchema,
  ]
)

export const corePurchaseSessionsInsertSchema =
  enhancedCreateInsertSchema(purchaseSessions, refinement)
export const purchasePurchaseSessionsInsertSchema =
  corePurchaseSessionsInsertSchema.extend(
    purchasePurchaseSessionRefinement
  )
export const invoicePurchaseSessionsInsertSchema =
  corePurchaseSessionsInsertSchema.extend(
    invoicePurchaseSessionRefinement
  )
export const productPurchaseSessionsInsertSchema =
  corePurchaseSessionsInsertSchema.extend(
    productPurchaseSessionRefinement
  )
export const purchaseSessionsInsertSchema = z.discriminatedUnion(
  'type',
  [
    purchasePurchaseSessionsInsertSchema,
    invoicePurchaseSessionsInsertSchema,
    productPurchaseSessionsInsertSchema,
  ]
)

export const corePurchaseSessionsUpdateSchema =
  corePurchaseSessionsInsertSchema.partial().extend({
    id: z.string(),
  })

const purchasePurchaseSessionUpdateSchema =
  corePurchaseSessionsUpdateSchema.extend(
    purchasePurchaseSessionRefinement
  )
const invoicePurchaseSessionUpdateSchema =
  corePurchaseSessionsUpdateSchema.extend(
    invoicePurchaseSessionRefinement
  )
const productPurchaseSessionUpdateSchema =
  corePurchaseSessionsUpdateSchema.extend(
    productPurchaseSessionRefinement
  )

export const purchaseSessionsUpdateSchema = z.discriminatedUnion(
  'type',
  [
    purchasePurchaseSessionUpdateSchema,
    invoicePurchaseSessionUpdateSchema,
    productPurchaseSessionUpdateSchema,
  ]
)

export const createPurchaseSessionInputSchema = z.object({
  purchaseSession: purchaseSessionsInsertSchema,
})

export type CreatePurchaseSessionInput = z.infer<
  typeof createPurchaseSessionInputSchema
>

const readOnlyColumns = {
  expires: true,
  status: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
  purchaseId: true,
} as const

const purchasePurchaseSessionClientUpdateSchema =
  purchasePurchaseSessionUpdateSchema.omit(readOnlyColumns).extend({
    id: z.string(),
  })
const invoicePurchaseSessionClientUpdateSchema =
  invoicePurchaseSessionUpdateSchema.omit(readOnlyColumns).extend({
    id: z.string(),
  })
const productPurchaseSessionClientUpdateSchema =
  productPurchaseSessionUpdateSchema.omit(readOnlyColumns).extend({
    id: z.string(),
  })

const purchaseSessionClientUpdateSchema = z.discriminatedUnion(
  'type',
  [
    purchasePurchaseSessionClientUpdateSchema,
    invoicePurchaseSessionClientUpdateSchema,
    productPurchaseSessionClientUpdateSchema,
  ]
)

export const editPurchaseSessionInputSchema = z.object({
  purchaseSession: purchaseSessionClientUpdateSchema,
  purchaseId: z.string().nullish(),
})

export type EditPurchaseSessionInput = z.infer<
  typeof editPurchaseSessionInputSchema
>
const hiddenColumns = {
  expires: true,
  status: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
} as const

export const purchasePurchaseSessionClientSelectSchema =
  purchasePurchaseSessionsSelectSchema.omit(hiddenColumns)
export const invoicePurchaseSessionClientSelectSchema =
  invoicePurchaseSessionsSelectSchema.omit(hiddenColumns)
export const productPurchaseSessionClientSelectSchema =
  productPurchaseSessionsSelectSchema.omit(hiddenColumns)

export const purchaseSessionClientSelectSchema = z.discriminatedUnion(
  'type',
  [
    purchasePurchaseSessionClientSelectSchema,
    invoicePurchaseSessionClientSelectSchema,
    productPurchaseSessionClientSelectSchema,
  ]
)

const feeReadyColumns = {
  billingAddress: billingAddressSchema,
  paymentMethodType: core.createSafeZodEnum(PaymentMethodType),
} as const

export const feeReadyPurchasePurchaseSessionSelectSchema =
  purchasePurchaseSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyInvoicePurchaseSessionSelectSchema =
  invoicePurchaseSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyProductPurchaseSessionSelectSchema =
  productPurchaseSessionClientSelectSchema.extend(feeReadyColumns)

export const feeReadyPurchaseSessionSelectSchema =
  z.discriminatedUnion('type', [
    feeReadyPurchasePurchaseSessionSelectSchema,
    feeReadyInvoicePurchaseSessionSelectSchema,
    feeReadyProductPurchaseSessionSelectSchema,
  ])

export const purchaseSessionsPaginatedSelectSchema =
  createPaginatedSelectSchema(purchaseSessionClientSelectSchema)

export const purchaseSessionsPaginatedListSchema =
  createPaginatedListQuerySchema(purchaseSessionClientSelectSchema)

export namespace PurchaseSession {
  export type Insert = z.infer<typeof purchaseSessionsInsertSchema>
  export type PurchaseInsert = z.infer<
    typeof purchasePurchaseSessionsInsertSchema
  >
  export type InvoiceInsert = z.infer<
    typeof invoicePurchaseSessionsInsertSchema
  >
  export type ProductInsert = z.infer<
    typeof productPurchaseSessionsInsertSchema
  >

  export type Update = z.infer<typeof purchaseSessionsUpdateSchema>

  export type PurchaseUpdate = z.infer<
    typeof purchasePurchaseSessionUpdateSchema
  >
  export type InvoiceUpdate = z.infer<
    typeof invoicePurchaseSessionUpdateSchema
  >
  export type ProductUpdate = z.infer<
    typeof productPurchaseSessionUpdateSchema
  >

  export type PurchaseRecord = z.infer<
    typeof purchasePurchaseSessionsSelectSchema
  >
  export type InvoiceRecord = z.infer<
    typeof invoicePurchaseSessionsSelectSchema
  >
  export type ProductRecord = z.infer<
    typeof productPurchaseSessionsSelectSchema
  >

  export type Record = z.infer<typeof purchaseSessionsSelectSchema>

  export type PurchaseClientRecord = z.infer<
    typeof purchasePurchaseSessionClientSelectSchema
  >

  export type InvoiceClientRecord = z.infer<
    typeof invoicePurchaseSessionClientSelectSchema
  >

  export type ProductClientRecord = z.infer<
    typeof productPurchaseSessionClientSelectSchema
  >

  export type ClientRecord = z.infer<
    typeof purchaseSessionClientSelectSchema
  >

  export type PurchaseClientUpdate = z.infer<
    typeof purchasePurchaseSessionClientUpdateSchema
  >

  export type InvoiceClientUpdate = z.infer<
    typeof invoicePurchaseSessionClientUpdateSchema
  >

  export type ProductClientUpdate = z.infer<
    typeof productPurchaseSessionClientUpdateSchema
  >

  export type ClientUpdate = z.infer<
    typeof purchaseSessionClientUpdateSchema
  >
  /**
   * A Purchase Session that has all the parameters necessary to create a FeeCalcuation
   */
  export type FeeReadyRecord = z.infer<
    typeof feeReadyPurchaseSessionSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof purchaseSessionsPaginatedListSchema
  >
}
