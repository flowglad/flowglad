import * as R from 'ramda'
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
  nullableStringForeignKey,
  SelectConditions,
  ommittedColumnsForInsertSchema,
  hiddenColumnsForClientSchema,
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
import {
  usageMeters,
  usageMetersClientSelectSchema,
} from './usageMeters'

const readOnlyColumns = {
  livemode: true,
  currency: true,
} as const

const hiddenColumns = {
  externalId: true,
  ...hiddenColumnsForClientSchema,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  ...R.omit(['position'], hiddenColumns),
} as const

const PRICES_TABLE_NAME = 'prices'

const columns = {
  ...tableBase('price'),
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
  /**
   * A hidden column, used primarily for managing migrations from
   * from external processors onto Flowglad
   */
  externalId: text('external_id'),
  usageMeterId: nullableStringForeignKey(
    'usage_meter_id',
    usageMeters
  ),
}

const usageMeterBelongsToSameOrganization = sql`"usage_meter_id" IS NULL OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters"
  WHERE "usage_meters"."organization_id" = (
    SELECT "organization_id" FROM "products" 
    WHERE "products"."id" = "prices"."product_id"
  )
)`
export const prices = pgTable(PRICES_TABLE_NAME, columns, (table) => {
  return [
    constructIndex(PRICES_TABLE_NAME, [table.type]),
    constructIndex(PRICES_TABLE_NAME, [table.productId]),
    constructUniqueIndex(PRICES_TABLE_NAME, [
      table.externalId,
      table.productId,
    ]),
    constructIndex(PRICES_TABLE_NAME, [table.usageMeterId]),
    pgPolicy(
      'On update, ensure usage meter belongs to same organization as product',
      {
        as: 'permissive',
        to: 'authenticated',
        for: 'update',
        withCheck: usageMeterBelongsToSameOrganization,
      }
    ),
    pgPolicy('Enable all for self organizations via products', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"product_id" in (select "id" from "products")`,
    }),
    livemodePolicy(),
  ]
}).enableRLS()

const intervalZodSchema = core.createSafeZodEnum(IntervalUnit)

const basePriceColumns = {
  type: core.createSafeZodEnum(PriceType),
  isDefault: z.boolean(),
  unitPrice: core.safeZodNonNegativeInteger,
  currency: core.createSafeZodEnum(CurrencyCode),
}

export const basePriceSelectSchema = createSelectSchema(
  prices,
  basePriceColumns
)

const { supabaseInsertPayloadSchema, supabaseUpdatePayloadSchema } =
  createSupabaseWebhookSchema({
    table: prices,
    tableName: PRICES_TABLE_NAME,
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

const usagePriceColumns = {
  ...subscriptionPriceColumns,
  trialPeriodDays: core.safeZodNullOrUndefined,
  usageMeterId: z
    .string()
    .describe(
      'The usage meter that uses this price. All usage events on that meter must be associated with a price that is also associated with that usage meter.'
    ),
  type: z.literal(PriceType.Usage),
}

const USAGE_PRICE_DESCRIPTION =
  'A usage price, which describes the price per unit of usage of a product.'

const SUBSCRIPTION_PRICE_DESCRIPTION =
  'A subscription price, which will have details on the interval, default trial period, and setup fee (if any).'

export const subscriptionPriceSelectSchema = basePriceSelectSchema
  .extend(subscriptionPriceColumns)
  .describe(SUBSCRIPTION_PRICE_DESCRIPTION)

export const subscriptionPriceInsertSchema =
  subscriptionPriceSelectSchema
    .omit(ommittedColumnsForInsertSchema)
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
    .omit(ommittedColumnsForInsertSchema)
    .describe(SINGLE_PAYMENT_PRICE_DESCRIPTION)

export const singlePaymentPriceUpdateSchema =
  singlePaymentPriceInsertSchema
    .partial()
    .extend({
      id: z.string(),
      type: z.literal(PriceType.SinglePayment),
    })
    .describe(SINGLE_PAYMENT_PRICE_DESCRIPTION)

const PRICES_SELECT_SCHEMA_DESCRIPTION =
  'A price record, which describes a price for a product. Products can have multiple prices.'

const PRICES_INSERT_SCHEMA_DESCRIPTION =
  'A price record, which describes a price for a product. Products can have multiple prices.'

const PRICES_UPDATE_SCHEMA_DESCRIPTION =
  'A price record, which describes a price for a product. Products can have multiple prices.'

export const usagePriceSelectSchema = basePriceSelectSchema
  .extend(usagePriceColumns)
  .describe(USAGE_PRICE_DESCRIPTION)

export const usagePriceInsertSchema = usagePriceSelectSchema
  .omit(ommittedColumnsForInsertSchema)
  .describe(USAGE_PRICE_DESCRIPTION)

export const usagePriceUpdateSchema = usagePriceInsertSchema
  .partial()
  .extend({
    id: z.string(),
    type: z.literal(PriceType.Usage),
  })
  .describe(USAGE_PRICE_DESCRIPTION)

export const usagePriceClientInsertSchema =
  usagePriceInsertSchema.omit(nonClientEditableColumns)

export const usagePriceClientUpdateSchema =
  usagePriceUpdateSchema.omit(nonClientEditableColumns)

export const usagePriceClientSelectSchema =
  usagePriceSelectSchema.omit(hiddenColumns)

export const pricesSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceSelectSchema,
    singlePaymentPriceSelectSchema,
    usagePriceSelectSchema,
  ])
  .describe(PRICES_SELECT_SCHEMA_DESCRIPTION)

export const pricesInsertSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceInsertSchema,
    singlePaymentPriceInsertSchema,
    usagePriceInsertSchema,
  ])
  .describe(PRICES_INSERT_SCHEMA_DESCRIPTION)

export const pricesUpdateSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceUpdateSchema,
    singlePaymentPriceUpdateSchema,
    usagePriceUpdateSchema,
  ])
  .describe(PRICES_UPDATE_SCHEMA_DESCRIPTION)

export const pricesSelectClauseSchema = basePriceSelectSchema
  .omit({
    id: true,
  })
  .partial()

export const subscriptionPriceClientInsertSchema =
  subscriptionPriceInsertSchema.omit(nonClientEditableColumns)

export const subscriptionPriceClientUpdateSchema =
  subscriptionPriceUpdateSchema.omit(nonClientEditableColumns)

export const subscriptionPriceClientSelectSchema =
  subscriptionPriceSelectSchema.omit(hiddenColumns)

export const subscribablePriceSelectSchema = z.discriminatedUnion(
  'type',
  [subscriptionPriceSelectSchema, usagePriceSelectSchema]
)

export const subscribablePriceClientSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientSelectSchema,
    usagePriceClientSelectSchema,
  ])
  .describe(
    'A subscribable price, which can be used to create a subscription based on standard recurring subscription prices or usage-based subscriptions.'
  )

export const singlePaymentPriceClientInsertSchema =
  singlePaymentPriceInsertSchema.omit(nonClientEditableColumns)

export const singlePaymentPriceClientUpdateSchema =
  singlePaymentPriceUpdateSchema.omit(nonClientEditableColumns)

export const singlePaymentPriceClientSelectSchema =
  singlePaymentPriceSelectSchema.omit(hiddenColumns)

export const pricesClientInsertSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientInsertSchema,
  singlePaymentPriceClientInsertSchema,
  usagePriceClientInsertSchema,
])

export const pricesClientUpdateSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientUpdateSchema,
  singlePaymentPriceClientUpdateSchema,
  usagePriceClientUpdateSchema,
])

export const pricesClientSelectSchema = z.discriminatedUnion('type', [
  subscriptionPriceClientSelectSchema,
  singlePaymentPriceClientSelectSchema,
  usagePriceClientSelectSchema,
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
  export type SinglePaymentInsert = z.infer<
    typeof singlePaymentPriceInsertSchema
  >
  export type SinglePaymentUpdate = z.infer<
    typeof singlePaymentPriceUpdateSchema
  >
  export type SinglePaymentRecord = z.infer<
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
  export type ClientSinglePaymentInsert = z.infer<
    typeof singlePaymentPriceClientInsertSchema
  >
  export type ClientSinglePaymentUpdate = z.infer<
    typeof singlePaymentPriceClientUpdateSchema
  >
  export type ClientSinglePaymentRecord = z.infer<
    typeof singlePaymentPriceClientSelectSchema
  >
  export type ClientInsert = z.infer<typeof pricesClientInsertSchema>
  export type ClientUpdate = z.infer<typeof pricesClientUpdateSchema>
  export type ClientRecord = z.infer<typeof pricesClientSelectSchema>
  export type ClientSelectClause = z.infer<
    typeof pricesSelectClauseSchema
  >
  export type PaginatedList = z.infer<
    typeof pricesPaginatedListSchema
  >

  export type UsageInsert = z.infer<typeof usagePriceInsertSchema>
  export type UsageUpdate = z.infer<typeof usagePriceUpdateSchema>
  export type UsageRecord = z.infer<typeof usagePriceSelectSchema>

  export type ClientUsageInsert = z.infer<
    typeof usagePriceClientInsertSchema
  >
  export type ClientUsageUpdate = z.infer<
    typeof usagePriceClientUpdateSchema
  >
  export type ClientUsageRecord = z.infer<
    typeof usagePriceClientSelectSchema
  >

  export type Where = SelectConditions<typeof prices>

  export type SubscribablePriceRecord = z.infer<
    typeof subscribablePriceSelectSchema
  >
  export type ClientSubscribablePriceRecord = z.infer<
    typeof subscribablePriceClientSelectSchema
  >
}

export const editPriceSchema = z.object({
  price: pricesClientUpdateSchema,
  id: z.string(),
})

export type EditPriceInput = z.infer<typeof editPriceSchema>

export const createPriceSchema = z.object({
  price: pricesClientInsertSchema,
})

export type CreatePriceInput = z.infer<typeof createPriceSchema>

const omitProductId = {
  productId: true,
} as const

export const createProductPriceInputSchema = z.discriminatedUnion(
  'type',
  [
    subscriptionPriceClientInsertSchema.omit(omitProductId),
    singlePaymentPriceClientInsertSchema.omit(omitProductId),
    usagePriceClientInsertSchema.omit(omitProductId),
  ]
)

export const createProductSchema = z.object({
  product: productsClientInsertSchema,
  price: createProductPriceInputSchema,
})

export type CreateProductPriceInput = z.infer<
  typeof createProductPriceInputSchema
>

export type CreateProductSchema = z.infer<typeof createProductSchema>

export const editProductSchema = z.object({
  product: productsUpdateSchema,
  price: pricesUpdateSchema.optional(),
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

export const catalogWithProductsAndUsageMetersSchema =
  catalogsClientSelectSchema.extend({
    products: z.array(productWithPricesSchema),
    usageMeters: z.array(usageMetersClientSelectSchema),
  })

export type CatalogWithProductsAndUsageMeters = z.infer<
  typeof catalogWithProductsAndUsageMetersSchema
>

export const pricesTableRowDataSchema = z.object({
  price: pricesClientSelectSchema,
  product: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const productsTableRowDataSchema = z.object({
  product: productsClientSelectSchema,
  prices: z.array(pricesClientSelectSchema),
  catalog: catalogsClientSelectSchema.optional(),
})

export type ProductsTableRowData = z.infer<
  typeof productsTableRowDataSchema
>
