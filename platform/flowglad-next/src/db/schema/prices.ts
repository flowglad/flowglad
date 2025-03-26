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

export const subscriptionPriceSelectSchema =
  basePriceSelectSchema.extend(subscriptionPriceColumns)

export const subscriptionPriceInsertSchema =
  subscriptionPriceSelectSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })

export const subscriptionPriceUpdateSchema =
  subscriptionPriceInsertSchema.partial().extend({
    id: z.string(),
    type: z.literal(PriceType.Subscription),
  })

const otherPriceColumns = {
  type: z.literal(PriceType.SinglePayment),
  intervalCount: core.safeZodNullOrUndefined,
  intervalUnit: core.safeZodNullOrUndefined,
  setupFeeAmount: core.safeZodNullOrUndefined,
  trialPeriodDays: core.safeZodNullOrUndefined,
}

export const otherPriceSelectSchema =
  basePriceSelectSchema.extend(otherPriceColumns)

export const otherPriceInsertSchema = otherPriceSelectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const otherPriceUpdateSchema = otherPriceInsertSchema
  .partial()
  .extend({
    id: z.string(),
    type: z.literal(PriceType.SinglePayment),
  })

export const pricesSelectSchema = z.discriminatedUnion('type', [
  subscriptionPriceSelectSchema,
  otherPriceSelectSchema,
])

export const pricesInsertSchema = z.discriminatedUnion('type', [
  subscriptionPriceInsertSchema,
  otherPriceInsertSchema,
])

export const pricesUpdateSchema = z.discriminatedUnion('type', [
  subscriptionPriceUpdateSchema,
  otherPriceUpdateSchema,
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

export const otherPriceClientInsertSchema =
  otherPriceInsertSchema.omit(nonClientEditableColumns)

export const otherPriceClientUpdateSchema =
  otherPriceUpdateSchema.omit(nonClientEditableColumns)

export const otherPriceClientSelectSchema =
  otherPriceSelectSchema.omit(hiddenColumns)

export const pricesClientInsertSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientInsertSchema,
  otherPriceClientInsertSchema,
])

export const pricesClientUpdateSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientUpdateSchema,
  otherPriceClientUpdateSchema,
])

export const pricesClientSelectSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientSelectSchema,
  otherPriceClientSelectSchema,
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
  export type OtherInsert = z.infer<typeof otherPriceInsertSchema>
  export type OtherUpdate = z.infer<typeof otherPriceUpdateSchema>
  export type OtherRecord = z.infer<typeof otherPriceSelectSchema>

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
    typeof otherPriceClientInsertSchema
  >
  export type ClientOtherUpdate = z.infer<
    typeof otherPriceClientUpdateSchema
  >
  export type ClientOtherRecord = z.infer<
    typeof otherPriceClientSelectSchema
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
    defaultPrice: pricesClientSelectSchema,
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
