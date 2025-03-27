import {
  integer,
  pgTable,
  text,
  boolean,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  pgEnumColumn,
  constructIndex,
  constructUniqueIndex,
  notNullStringForeignKey,
  tableBase,
  createSupabaseWebhookSchema,
  livemodePolicy,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
} from '@/db/tableUtils'
import {
  products,
  productsClientInsertSchema,
  productsClientSelectSchema,
  productsUpdateSchema,
} from '@/db/schema/products'
import core from '@/utils/core'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { catalogsClientSelectSchema } from './catalogs'

const VARIANTS_TABLE_NAME = 'prices'

const columns = {
  ...tableBase('vrnt'),
  intervalUnit: pgEnumColumn({
    enumName: 'IntervalUnit',
    columnName: 'interval_unit',
    enumBase: IntervalUnit,
  }),
  name: text('name'),
  intervalCount: integer('intervalCount'),
  type: pgEnumColumn({
    enumName: 'PriceType',
    columnName: 'type',
    enumBase: PriceType,
  }).notNull(),
  trialPeriodDays: integer('trial_period_days'),
  setupFeeAmount: integer('setup_fee_amount'),
  isDefault: boolean('is_default').notNull(),
  unitPrice: integer('unit_price').notNull(),
  /**
   * Omitting this for now to reduce MVP complexity,
   * will re-introduce later
   */
  // includeTaxInPrice: boolean('includeTaxInPrice')
  //   .notNull()
  //   .default(false),
  productId: notNullStringForeignKey('product_id', products),
  active: boolean('active').notNull().default(true),
  currency: pgEnumColumn({
    enumName: 'CurrencyCode',
    columnName: 'currency',
    enumBase: CurrencyCode,
  }).notNull(),
}

export const prices = pgTable(
  VARIANTS_TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(VARIANTS_TABLE_NAME, [table.type]),
      constructIndex(VARIANTS_TABLE_NAME, [table.productId]),
      pgPolicy('Enable all for self organizations via products', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"product_id" in (select "id" from "products")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const intervalZodSchema = core.createSafeZodEnum(IntervalUnit)

const basePriceColumns = {
  type: core.createSafeZodEnum(PriceType),
  isDefault: z.boolean(),
  unitPrice: core.safeZodPositiveInteger,
  currency: core.createSafeZodEnum(CurrencyCode),
}

export const basePriceSelectSchema = createSelectSchema(
  prices,
  basePriceColumns
)

const { supabaseInsertPayloadSchema, supabaseUpdatePayloadSchema } =
  createSupabaseWebhookSchema({
    table: prices,
    tableName: VARIANTS_TABLE_NAME,
    refine: basePriceColumns,
  })

export const pricesSupabaseInsertPayloadSchema =
  supabaseInsertPayloadSchema
export const pricesSupabaseUpdatePayloadSchema =
  supabaseUpdatePayloadSchema

const subscriptionPriceColumns = {
  type: z.literal(PriceType.Subscription),
  intervalCount: core.safeZodPositiveInteger,
  intervalUnit: intervalZodSchema,
  setupFeeAmount: core.safeZodPositiveIntegerOrZero.nullable(),
  trialPeriodDays: core.safeZodPositiveIntegerOrZero.nullable(),
}

const SUBSCRIPTION_PRICE_DESCRIPTION =
  'A subscription price, which will have details on the interval, default trial period, and setup fee (if any).'

export const subscriptionPriceSelectSchema = basePriceSelectSchema
  .extend(subscriptionPriceColumns)
  .describe(SUBSCRIPTION_PRICE_DESCRIPTION)

export const subscriptionPriceInsertSchema =
  subscriptionPriceSelectSchema
    .omit({
      id: true,
      createdAt: true,
      updatedAt: true,
    })
    .describe(SUBSCRIPTION_PRICE_DESCRIPTION)

export const subscriptionPriceUpdateSchema =
  subscriptionPriceInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(PriceType.Subscription),
    })
    .describe(SUBSCRIPTION_PRICE_DESCRIPTION)

const singlePaymentPriceColumns = {
  type: z.literal(PriceType.SinglePayment),
  intervalCount: core.safeZodNullOrUndefined,
  intervalUnit: core.safeZodNullOrUndefined,
  setupFeeAmount: core.safeZodNullOrUndefined,
  trialPeriodDays: core.safeZodNullOrUndefined,
}

const SINGLE_PAYMENT_PRICE_DESCRIPTION =
  'A single payment price, which only gets paid once. Subscriptions cannot be made from single payment prices. Purchases, though, can.'

export const singlePaymentPriceSelectSchema = basePriceSelectSchema
  .extend(singlePaymentPriceColumns)
  .describe(SINGLE_PAYMENT_PRICE_DESCRIPTION)

export const singlePaymentPriceInsertSchema =
  singlePaymentPriceSelectSchema
    .omit({
      id: true,
      createdAt: true,
      updatedAt: true,
    })
    .describe(SINGLE_PAYMENT_PRICE_DESCRIPTION)

export const singlePaymentPriceUpdateSchema =
  singlePaymentPriceInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(PriceType.SinglePayment),
    })
    .describe(SINGLE_PAYMENT_PRICE_DESCRIPTION)

export const pricesSelectSchema = z.discriminatedUnion('type', [
  subscriptionPriceSelectSchema,
  singlePaymentPriceSelectSchema,
])

export const pricesInsertSchema = z.discriminatedUnion('type', [
  subscriptionPriceInsertSchema,
  singlePaymentPriceInsertSchema,
])

export const pricesUpdateSchema = z.discriminatedUnion('type', [
  subscriptionPriceUpdateSchema,
  singlePaymentPriceUpdateSchema,
])

export const variantSelectClauseSchema = basePriceSelectSchema
  .omit({
    id: true,
  })
  .partial()

const readOnlyColumns = {
  livemode: true,
  currency: true,
} as const

const hiddenColumns = {} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
} as const

export const subscriptionPriceClientInsertSchema =
  subscriptionPriceInsertSchema.omit(nonClientEditableColumns)

export const subscriptionPriceClientUpdateSchema =
  subscriptionPriceUpdateSchema.omit(nonClientEditableColumns)

export const subscriptionPriceClientSelectSchema =
  subscriptionPriceSelectSchema.omit(hiddenColumns)

export const singlePaymentPriceClientInsertSchema =
  singlePaymentPriceInsertSchema.omit(nonClientEditableColumns)

export const singlePaymentPriceClientUpdateSchema =
  singlePaymentPriceUpdateSchema.omit(nonClientEditableColumns)

export const singlePaymentPriceClientSelectSchema =
  singlePaymentPriceSelectSchema.omit(hiddenColumns)

export const pricesClientInsertSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientInsertSchema,
  singlePaymentPriceClientInsertSchema,
])

export const pricesClientUpdateSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientUpdateSchema,
  singlePaymentPriceClientUpdateSchema,
])

export const pricesClientSelectSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientSelectSchema,
  singlePaymentPriceClientSelectSchema,
])

export const pricesPaginatedSelectSchema =
  createPaginatedSelectSchema(
    z.object({
      productId: z.string().optional(),
      type: z.nativeEnum(PriceType).optional(),
      active: z.boolean().optional(),
    })
  )

export const pricesPaginatedListSchema =
  createPaginatedListQuerySchema(pricesClientSelectSchema)

export namespace Price {
  export type Insert = z.infer<typeof pricesInsertSchema>
  export type Update = z.infer<typeof pricesUpdateSchema>
  export type Record = z.infer<typeof pricesSelectSchema>

  export type SubscriptionInsert = z.infer<
    typeof subscriptionPriceInsertSchema
  >
  export type SubscriptionUpdate = z.infer<
    typeof subscriptionPriceUpdateSchema
  >
  export type SubscriptionRecord = z.infer<
    typeof subscriptionPriceSelectSchema
  >
  export type OtherInsert = z.infer<
    typeof singlePaymentPriceInsertSchema
  >
  export type OtherUpdate = z.infer<
    typeof singlePaymentPriceUpdateSchema
  >
  export type OtherRecord = z.infer<
    typeof singlePaymentPriceSelectSchema
  >

  export type ClientSubscriptionInsert = z.infer<
    typeof subscriptionPriceClientInsertSchema
  >
  export type ClientSubscriptionUpdate = z.infer<
    typeof subscriptionPriceClientUpdateSchema
  >
  export type ClientSubscriptionRecord = z.infer<
    typeof subscriptionPriceClientSelectSchema
  >
  export type ClientOtherInsert = z.infer<
    typeof singlePaymentPriceClientInsertSchema
  >
  export type ClientOtherUpdate = z.infer<
    typeof singlePaymentPriceClientUpdateSchema
  >
  export type ClientOtherRecord = z.infer<
    typeof singlePaymentPriceClientSelectSchema
  >
  export type ClientInsert = z.infer<typeof pricesClientInsertSchema>
  export type ClientUpdate = z.infer<typeof pricesClientUpdateSchema>
  export type ClientRecord = z.infer<typeof pricesClientSelectSchema>
  export type ClientSelectClause = z.infer<
    typeof variantSelectClauseSchema
  >
  export type PaginatedList = z.infer<
    typeof pricesPaginatedListSchema
  >
}

export const editPriceSchema = z.object({
  price: pricesUpdateSchema,
  id: z.string(),
})

export type EditPriceInput = z.infer<typeof editPriceSchema>

export const createPriceSchema = z.object({
  price: pricesInsertSchema,
})

export type CreatePriceInput = z.infer<typeof createPriceSchema>

export const createProductSchema = z.object({
  product: productsClientInsertSchema,
  price: pricesClientInsertSchema,
})

export type CreateProductSchema = z.infer<typeof createProductSchema>

export const editProductSchema = z.object({
  product: productsUpdateSchema,
  price: pricesUpdateSchema,
  id: z.string(),
})

export type EditProductInput = z.infer<typeof editProductSchema>

export const productWithPricesSchema =
  productsClientSelectSchema.extend({
    prices: z.array(pricesClientSelectSchema),
    defaultPrice: pricesClientSelectSchema.describe(
      'The default price for the product. If no price is explicitly set as default, will return the first price created for the product..'
    ),
  })

export type ProductWithPrices = z.infer<
  typeof productWithPricesSchema
>

export const catalogWithProductsSchema =
  catalogsClientSelectSchema.extend({
    products: z.array(productWithPricesSchema),
  })

export type CatalogWithProductsAndPrices = z.infer<
  typeof catalogWithProductsSchema
>
