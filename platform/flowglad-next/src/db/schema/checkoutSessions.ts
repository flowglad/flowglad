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
import { billingAddressSchema } from '@/db/schema/organizations'
import core from '@/utils/core'
import { prices } from './prices'
import {
  PaymentMethodType,
  CheckoutSessionStatus,
  CheckoutSessionType,
} from '@/types'
import { organizations } from './organizations'
import { purchases } from './purchases'
import { discounts } from './discounts'
import { customers } from './customers'
import { sql } from 'drizzle-orm'
import { invoices } from './invoices'

const TABLE_NAME = 'checkout_sessions'

const columns = {
  ...tableBase('chckt_session'),
  status: pgEnumColumn({
    enumName: 'CheckoutSessionStatus',
    columnName: 'status',
    enumBase: CheckoutSessionStatus,
  }).notNull(),
  billingAddress: jsonb('billing_address'),
  priceId: nullableStringForeignKey('price_id', prices),
  purchaseId: nullableStringForeignKey('purchase_id', purchases),
  invoiceId: nullableStringForeignKey('invoice_id', invoices),
  // outputMetadata: jsonb('output_metadata'),
  /**
   * Should only be non-1 in the case of priceId is not null.
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
  customerId: nullableStringForeignKey('customer_id', customers),
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
    enumName: 'CheckoutSessionType',
    columnName: 'type',
    enumBase: CheckoutSessionType,
  }).notNull(),
  outputMetadata: jsonb('output_metadata'),
  outputName: text('output_name'),
}

export const checkoutSessions = pgTable(
  TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.priceId]),
      constructIndex(TABLE_NAME, [table.stripePaymentIntentId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.status]),
      constructIndex(TABLE_NAME, [table.stripeSetupIntentId]),
      constructIndex(TABLE_NAME, [table.purchaseId]),
      constructIndex(TABLE_NAME, [table.discountId]),
      constructIndex(TABLE_NAME, [table.customerId]),
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

export const checkoutSessionOutputMetadataSchema = z
  .record(z.string(), z.any())
  .nullable()
const refinement = {
  ...newBaseZodSelectSchemaColumns,
  billingAddress: billingAddressSchema.nullable(),
  status: core.createSafeZodEnum(CheckoutSessionStatus),
  successUrl: z.string().url().nullable(),
  cancelUrl: z.string().url().nullable(),
  // outputMetadata: z.any().nullable(),
  paymentMethodType: core
    .createSafeZodEnum(PaymentMethodType)
    .nullable(),
  outputMetadata: checkoutSessionOutputMetadataSchema,
}

const purchaseCheckoutSessionRefinement = {
  purchaseId: z.string(),
  priceId: z.string(),
  type: z.literal(CheckoutSessionType.Purchase),
}

const invoiceCheckoutSessionRefinement = {
  invoiceId: z.string(),
  priceId: z.null(),
  purchaseId: z.null(),
  type: z.literal(CheckoutSessionType.Invoice),
  outputMetadata: z.null(),
}

const productCheckoutSessionRefinement = {
  priceId: z.string(),
  invoiceId: z.null(),
  type: z.literal(CheckoutSessionType.Product),
}

export const coreCheckoutSessionsSelectSchema = createSelectSchema(
  checkoutSessions,
  refinement
)

const purchaseCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(purchaseCheckoutSessionRefinement)
    .describe(
      'A checkout session for a customized purchase, which will complete the purchase record and (if for a subscription price) a subscription upon successful completion.'
    )
const invoiceCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(invoiceCheckoutSessionRefinement)
    .describe(
      'A checkout session for an invoice, which will only create a payment record associated with the invoice upon successful completion. It will not create a subscription or purchase.'
    )

const productCheckoutSessionsSelectSchema =
  coreCheckoutSessionsSelectSchema
    .extend(productCheckoutSessionRefinement)
    .describe(
      'A checkout session for a product, which will create a purchase record and (if for a subscription price) a subscription upon successful completion.'
    )

export const checkoutSessionsSelectSchema = z.discriminatedUnion(
  'type',
  [
    purchaseCheckoutSessionsSelectSchema,
    invoiceCheckoutSessionsSelectSchema,
    productCheckoutSessionsSelectSchema,
  ]
)

export const coreCheckoutSessionsInsertSchema =
  enhancedCreateInsertSchema(checkoutSessions, refinement)
export const purchaseCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    purchaseCheckoutSessionRefinement
  )
export const invoiceCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    invoiceCheckoutSessionRefinement
  )
export const productCheckoutSessionsInsertSchema =
  coreCheckoutSessionsInsertSchema.extend(
    productCheckoutSessionRefinement
  )
export const checkoutSessionsInsertSchema = z.discriminatedUnion(
  'type',
  [
    purchaseCheckoutSessionsInsertSchema,
    invoiceCheckoutSessionsInsertSchema,
    productCheckoutSessionsInsertSchema,
  ]
)

export const coreCheckoutSessionsUpdateSchema =
  coreCheckoutSessionsInsertSchema.partial().extend({
    id: z.string(),
  })

const purchaseCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    purchaseCheckoutSessionRefinement
  )
const invoiceCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    invoiceCheckoutSessionRefinement
  )
const productCheckoutSessionUpdateSchema =
  coreCheckoutSessionsUpdateSchema.extend(
    productCheckoutSessionRefinement
  )

export const checkoutSessionsUpdateSchema = z.discriminatedUnion(
  'type',
  [
    purchaseCheckoutSessionUpdateSchema,
    invoiceCheckoutSessionUpdateSchema,
    productCheckoutSessionUpdateSchema,
  ]
)

export const createCheckoutSessionInputSchema = z.object({
  checkoutSession: checkoutSessionsInsertSchema,
})

export type CreateCheckoutSessionInput = z.infer<
  typeof createCheckoutSessionInputSchema
>

const readOnlyColumns = {
  expires: true,
  status: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
  purchaseId: true,
} as const

const purchaseCheckoutSessionClientUpdateSchema =
  purchaseCheckoutSessionUpdateSchema.omit(readOnlyColumns).extend({
    id: z.string(),
  })
const invoiceCheckoutSessionClientUpdateSchema =
  invoiceCheckoutSessionUpdateSchema.omit(readOnlyColumns).extend({
    id: z.string(),
  })
const productCheckoutSessionClientUpdateSchema =
  productCheckoutSessionUpdateSchema.omit(readOnlyColumns).extend({
    id: z.string(),
  })

const checkoutSessionClientUpdateSchema = z.discriminatedUnion(
  'type',
  [
    purchaseCheckoutSessionClientUpdateSchema,
    invoiceCheckoutSessionClientUpdateSchema,
    productCheckoutSessionClientUpdateSchema,
  ]
)

export const editCheckoutSessionInputSchema = z.object({
  checkoutSession: checkoutSessionClientUpdateSchema,
  purchaseId: z.string().nullish(),
})

export type EditCheckoutSessionInput = z.infer<
  typeof editCheckoutSessionInputSchema
>
const hiddenColumns = {
  expires: true,
  status: true,
  stripePaymentIntentId: true,
  stripeSetupIntentId: true,
} as const

export const purchaseCheckoutSessionClientSelectSchema =
  purchaseCheckoutSessionsSelectSchema.omit(hiddenColumns)
export const invoiceCheckoutSessionClientSelectSchema =
  invoiceCheckoutSessionsSelectSchema.omit(hiddenColumns)
export const productCheckoutSessionClientSelectSchema =
  productCheckoutSessionsSelectSchema.omit(hiddenColumns)

export const checkoutSessionClientSelectSchema = z.discriminatedUnion(
  'type',
  [
    purchaseCheckoutSessionClientSelectSchema,
    invoiceCheckoutSessionClientSelectSchema,
    productCheckoutSessionClientSelectSchema,
  ]
)

const feeReadyColumns = {
  billingAddress: billingAddressSchema,
  paymentMethodType: core.createSafeZodEnum(PaymentMethodType),
} as const

export const feeReadyPurchaseCheckoutSessionSelectSchema =
  purchaseCheckoutSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyInvoiceCheckoutSessionSelectSchema =
  invoiceCheckoutSessionClientSelectSchema.extend(feeReadyColumns)
export const feeReadyProductCheckoutSessionSelectSchema =
  productCheckoutSessionClientSelectSchema.extend(feeReadyColumns)

export const feeReadyCheckoutSessionSelectSchema =
  z.discriminatedUnion('type', [
    feeReadyPurchaseCheckoutSessionSelectSchema,
    feeReadyInvoiceCheckoutSessionSelectSchema,
    feeReadyProductCheckoutSessionSelectSchema,
  ])

export const checkoutSessionsPaginatedSelectSchema =
  createPaginatedSelectSchema(checkoutSessionClientSelectSchema)

export const checkoutSessionsPaginatedListSchema =
  createPaginatedListQuerySchema(checkoutSessionClientSelectSchema)

export namespace CheckoutSession {
  export type Insert = z.infer<typeof checkoutSessionsInsertSchema>
  export type PurchaseInsert = z.infer<
    typeof purchaseCheckoutSessionsInsertSchema
  >
  export type InvoiceInsert = z.infer<
    typeof invoiceCheckoutSessionsInsertSchema
  >
  export type ProductInsert = z.infer<
    typeof productCheckoutSessionsInsertSchema
  >

  export type Update = z.infer<typeof checkoutSessionsUpdateSchema>

  export type PurchaseUpdate = z.infer<
    typeof purchaseCheckoutSessionUpdateSchema
  >
  export type InvoiceUpdate = z.infer<
    typeof invoiceCheckoutSessionUpdateSchema
  >
  export type ProductUpdate = z.infer<
    typeof productCheckoutSessionUpdateSchema
  >

  export type PurchaseRecord = z.infer<
    typeof purchaseCheckoutSessionsSelectSchema
  >
  export type InvoiceRecord = z.infer<
    typeof invoiceCheckoutSessionsSelectSchema
  >
  export type ProductRecord = z.infer<
    typeof productCheckoutSessionsSelectSchema
  >

  export type Record = z.infer<typeof checkoutSessionsSelectSchema>

  export type PurchaseClientRecord = z.infer<
    typeof purchaseCheckoutSessionClientSelectSchema
  >

  export type InvoiceClientRecord = z.infer<
    typeof invoiceCheckoutSessionClientSelectSchema
  >

  export type ProductClientRecord = z.infer<
    typeof productCheckoutSessionClientSelectSchema
  >

  export type ClientRecord = z.infer<
    typeof checkoutSessionClientSelectSchema
  >

  export type PurchaseClientUpdate = z.infer<
    typeof purchaseCheckoutSessionClientUpdateSchema
  >

  export type InvoiceClientUpdate = z.infer<
    typeof invoiceCheckoutSessionClientUpdateSchema
  >

  export type ProductClientUpdate = z.infer<
    typeof productCheckoutSessionClientUpdateSchema
  >

  export type ClientUpdate = z.infer<
    typeof checkoutSessionClientUpdateSchema
  >
  /**
   * A Purchase Session that has all the parameters necessary to create a FeeCalcuation
   */
  export type FeeReadyRecord = z.infer<
    typeof feeReadyCheckoutSessionSelectSchema
  >
  export type PaginatedList = z.infer<
    typeof checkoutSessionsPaginatedListSchema
  >
  export type OutputMetadata = z.infer<
    typeof checkoutSessionOutputMetadataSchema
  >
}
