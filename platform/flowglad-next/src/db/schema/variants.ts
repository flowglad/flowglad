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
  productsUpdateSchema,
} from '@/db/schema/products'
import core from '@/utils/core'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { z } from 'zod'
import { sql } from 'drizzle-orm'

const VARIANTS_TABLE_NAME = 'Variants'

const columns = {
  ...tableBase('vrnt'),
  intervalUnit: pgEnumColumn({
    enumName: 'IntervalUnit',
    columnName: 'intervalUnit',
    enumBase: IntervalUnit,
  }),
  name: text('name'),
  intervalCount: integer('intervalCount'),
  priceType: pgEnumColumn({
    enumName: 'PriceType',
    columnName: 'priceType',
    enumBase: PriceType,
  }).notNull(),
  trialPeriodDays: integer('trialPeriodDays'),
  setupFeeAmount: integer('setupFeeAmount'),
  isDefault: boolean('isDefault').notNull(),
  unitPrice: integer('unitPrice').notNull(),
  /**
   * Omitting this for now to reduce MVP complexity,
   * will re-introduce later
   */
  // includeTaxInPrice: boolean('includeTaxInPrice')
  //   .notNull()
  //   .default(false),
  productId: notNullStringForeignKey('ProductId', products),
  stripePriceId: text('stripePriceId').unique(),
  active: boolean('active').notNull().default(true),
  currency: pgEnumColumn({
    enumName: 'CurrencyCode',
    columnName: 'currency',
    enumBase: CurrencyCode,
  }).notNull(),
}

export const variants = pgTable(
  VARIANTS_TABLE_NAME,
  columns,
  (table) => {
    return [
      constructIndex(VARIANTS_TABLE_NAME, [table.priceType]),
      constructIndex(VARIANTS_TABLE_NAME, [table.productId]),
      constructUniqueIndex(VARIANTS_TABLE_NAME, [
        table.stripePriceId,
      ]),
      pgPolicy('Enable all for self organizations via products', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"ProductId" in (select "id" from "Products")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const intervalZodSchema = core.createSafeZodEnum(IntervalUnit)

const baseVariantColumns = {
  priceType: core.createSafeZodEnum(PriceType),
  isDefault: z.boolean(),
  unitPrice: core.safeZodPositiveInteger,
  stripePriceId: z.string().nullish(),
  currency: core.createSafeZodEnum(CurrencyCode),
}

export const baseVariantSelectSchema = createSelectSchema(
  variants,
  baseVariantColumns
)

const { supabaseInsertPayloadSchema, supabaseUpdatePayloadSchema } =
  createSupabaseWebhookSchema({
    table: variants,
    tableName: VARIANTS_TABLE_NAME,
    refine: baseVariantColumns,
  })

export const variantsSupabaseInsertPayloadSchema =
  supabaseInsertPayloadSchema
export const variantsSupabaseUpdatePayloadSchema =
  supabaseUpdatePayloadSchema

const subscriptionVariantColumns = {
  priceType: z.literal(PriceType.Subscription),
  intervalCount: core.safeZodPositiveInteger,
  intervalUnit: intervalZodSchema,
  setupFeeAmount: core.safeZodPositiveIntegerOrZero.nullable(),
  trialPeriodDays: core.safeZodPositiveIntegerOrZero.nullable(),
}

export const subscriptionVariantSelectSchema =
  baseVariantSelectSchema.extend(subscriptionVariantColumns)

export const subscriptionVariantInsertSchema =
  subscriptionVariantSelectSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })

export const subscriptionVariantUpdateSchema =
  subscriptionVariantInsertSchema.partial().extend({
    id: z.string(),
    priceType: z.literal(PriceType.Subscription),
  })

const otherVariantColumns = {
  priceType: z.literal(PriceType.SinglePayment),
  intervalCount: core.safeZodNullOrUndefined,
  intervalUnit: core.safeZodNullOrUndefined,
  setupFeeAmount: core.safeZodNullOrUndefined,
  trialPeriodDays: core.safeZodNullOrUndefined,
}

export const otherVariantSelectSchema =
  baseVariantSelectSchema.extend(otherVariantColumns)

export const otherVariantInsertSchema = otherVariantSelectSchema.omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
)

export const otherVariantUpdateSchema = otherVariantInsertSchema
  .partial()
  .extend({
    id: z.string(),
    priceType: z.literal(PriceType.SinglePayment),
  })

export const variantsSelectSchema = z.discriminatedUnion(
  'priceType',
  [subscriptionVariantSelectSchema, otherVariantSelectSchema]
)

export const variantsInsertSchema = z.discriminatedUnion(
  'priceType',
  [subscriptionVariantInsertSchema, otherVariantInsertSchema]
)

export const variantsUpdateSchema = z.discriminatedUnion(
  'priceType',
  [subscriptionVariantUpdateSchema, otherVariantUpdateSchema]
)

export const variantSelectClauseSchema = baseVariantSelectSchema
  .omit({
    id: true,
  })
  .partial()

const readOnlyColumns = {
  livemode: true,
  currency: true,
} as const

const hiddenColumns = {
  stripePriceId: true,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...hiddenColumns,
} as const

export const subscriptionVariantClientInsertSchema =
  subscriptionVariantInsertSchema.omit(nonClientEditableColumns)

export const subscriptionVariantClientUpdateSchema =
  subscriptionVariantUpdateSchema.omit(nonClientEditableColumns)

export const subscriptionVariantClientSelectSchema =
  subscriptionVariantSelectSchema.omit(hiddenColumns)

export const otherVariantClientInsertSchema =
  otherVariantInsertSchema.omit(nonClientEditableColumns)

export const otherVariantClientUpdateSchema =
  otherVariantUpdateSchema.omit(nonClientEditableColumns)

export const otherVariantClientSelectSchema =
  otherVariantSelectSchema.omit(hiddenColumns)

export const variantsClientInsertSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionVariantClientInsertSchema,
    otherVariantClientInsertSchema,
  ]
)

export const variantsClientUpdateSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionVariantClientUpdateSchema,
    otherVariantClientUpdateSchema,
  ]
)

export const variantsClientSelectSchema = z.discriminatedUnion(
  'priceType',
  [
    subscriptionVariantClientSelectSchema,
    otherVariantClientSelectSchema,
  ]
)

export const variantsPaginatedSelectSchema =
  createPaginatedSelectSchema(
    z.object({
      productId: z.string().optional(),
      priceType: z.nativeEnum(PriceType).optional(),
      active: z.boolean().optional(),
    })
  )

export const variantsPaginatedListSchema =
  createPaginatedListQuerySchema<
    z.infer<typeof variantsClientSelectSchema>
  >(variantsClientSelectSchema)

export namespace Variant {
  export type Insert = z.infer<typeof variantsInsertSchema>
  export type Update = z.infer<typeof variantsUpdateSchema>
  export type Record = z.infer<typeof variantsSelectSchema>

  export type SubscriptionInsert = z.infer<
    typeof subscriptionVariantInsertSchema
  >
  export type SubscriptionUpdate = z.infer<
    typeof subscriptionVariantUpdateSchema
  >
  export type SubscriptionRecord = z.infer<
    typeof subscriptionVariantSelectSchema
  >
  export type OtherInsert = z.infer<typeof otherVariantInsertSchema>
  export type OtherUpdate = z.infer<typeof otherVariantUpdateSchema>
  export type OtherRecord = z.infer<typeof otherVariantSelectSchema>

  export type ClientSubscriptionInsert = z.infer<
    typeof subscriptionVariantClientInsertSchema
  >
  export type ClientSubscriptionUpdate = z.infer<
    typeof subscriptionVariantClientUpdateSchema
  >
  export type ClientSubscriptionRecord = z.infer<
    typeof subscriptionVariantClientSelectSchema
  >
  export type ClientOtherInsert = z.infer<
    typeof otherVariantClientInsertSchema
  >
  export type ClientOtherUpdate = z.infer<
    typeof otherVariantClientUpdateSchema
  >
  export type ClientOtherRecord = z.infer<
    typeof otherVariantClientSelectSchema
  >
  export type ClientInsert = z.infer<
    typeof variantsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof variantsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof variantsClientSelectSchema
  >
  export type ClientSelectClause = z.infer<
    typeof variantSelectClauseSchema
  >
  export type PaginatedList = z.infer<
    typeof variantsPaginatedListSchema
  >
}

export const editVariantSchema = z.object({
  variant: variantsUpdateSchema,
  id: z.string(),
})

export type EditVariantInput = z.infer<typeof editVariantSchema>

export const createVariantSchema = z.object({
  variant: variantsInsertSchema,
})

export type CreateVariantInput = z.infer<typeof createVariantSchema>

export const createProductSchema = z.object({
  product: productsClientInsertSchema,
  variant: variantsClientInsertSchema,
})

export type CreateProductSchema = z.infer<typeof createProductSchema>

export const editProductSchema = z.object({
  product: productsUpdateSchema,
  variant: variantsUpdateSchema,
  id: z.string(),
})

export type EditProductInput = z.infer<typeof editProductSchema>
