import * as R from 'ramda'
import {
  integer,
  pgTable,
  text,
  boolean,
  pgPolicy,
  PgColumn,
  uniqueIndex,
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
  parentForeignKeyIntegrityCheckPolicy,
  merchantPolicy,
  enableCustomerReadPolicy,
  clientWriteOmitsConstructor,
} from '@/db/tableUtils'
import {
  products,
  productsClientInsertSchema,
  productsClientSelectSchema,
  productsClientUpdateSchema,
} from '@/db/schema/products'
import core from '@/utils/core'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import { z } from 'zod'
import { ColumnBaseConfig, ColumnDataType, sql } from 'drizzle-orm'
import { pricingModelsClientSelectSchema } from './pricingModels'
import {
  usageMeters,
  usageMetersClientSelectSchema,
} from './usageMeters'
import { currencyCodeSchema } from '../commonZodSchema'
import {
  featuresClientSelectSchema,
  featuresSelectSchema,
} from './features'

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
  ...clientWriteOmitsConstructor(hiddenColumns),
} as const

const TABLE_NAME = 'prices'

const usageMeterBelongsToSameOrganization = sql`"usage_meter_id" IS NULL OR "usage_meter_id" IN (
  SELECT "id" FROM "usage_meters"
  WHERE "usage_meters"."organization_id" = (
    SELECT "organization_id" FROM "products" 
    WHERE "products"."id" = "prices"."product_id"
  )
)`

export const prices = pgTable(
  TABLE_NAME,
  {
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
    usageEventsPerUnit: integer('usage_events_per_unit'),
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
    startsWithCreditTrial: boolean('starts_with_credit_trial'),
    /**
     * A hidden column, used primarily for managing migrations from
     * from external processors onto Flowglad
     */
    externalId: text('external_id'),
    slug: text('slug'),
    overagePriceId: text('overage_price_id').references(
      (): PgColumn<
        ColumnBaseConfig<ColumnDataType, string>,
        {},
        {}
      > => prices.id
    ),
    usageMeterId: nullableStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.type]),
      constructIndex(TABLE_NAME, [table.productId]),
      constructUniqueIndex(TABLE_NAME, [
        table.externalId,
        table.productId,
      ]),
      uniqueIndex('prices_product_id_is_default_unique_idx')
        .on(table.productId)
        .where(sql`${table.isDefault}`),
      constructIndex(TABLE_NAME, [table.usageMeterId]),
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"product_id" in (select "id" from "products") and "active" = true`,
        }
      ),
      merchantPolicy(
        'On update, ensure usage meter belongs to same organization as product',
        {
          as: 'permissive',
          to: 'merchant',
          for: 'update',
          withCheck: usageMeterBelongsToSameOrganization,
        }
      ),
      parentForeignKeyIntegrityCheckPolicy({
        parentTableName: 'products',
        parentIdColumnInCurrentTable: 'product_id',
        currentTableName: TABLE_NAME,
      }),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

export const nulledPriceColumns = {
  overagePriceId: null,
  usageEventsPerUnit: null,
  startsWithCreditTrial: null,
  usageMeterId: null,
  trialPeriodDays: null,
  setupFeeAmount: null,
  intervalUnit: null,
  intervalCount: null,
}

const intervalZodSchema = core.createSafeZodEnum(IntervalUnit)

const basePriceColumns = {
  type: core.createSafeZodEnum(PriceType),
  isDefault: z
    .boolean()
    .describe(
      'Whether or not this price is the default price for the product.'
    ),
  unitPrice: core.safeZodPositiveIntegerOrZero.describe(
    'The price per unit. This should be in the smallest unit of the currency. For example, if the currency is USD, GBP, CAD, EUR or SGD, the price should be in cents. If'
  ),
  currency: currencyCodeSchema,
  usageEventsPerUnit: core.safeZodNullOrUndefined,
  startsWithCreditTrial: core.safeZodNullOrUndefined,
}

export const basePriceSelectSchema = createSelectSchema(
  prices,
  basePriceColumns
)

const { supabaseInsertPayloadSchema, supabaseUpdatePayloadSchema } =
  createSupabaseWebhookSchema({
    table: prices,
    tableName: TABLE_NAME,
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
  trialPeriodDays: core.safeZodPositiveIntegerOrZero
    .nullable()
    .describe(
      'The trial period in days. If the trial period is 0 or null, there will be no trial period.'
    ),
  usageEventsPerUnit: core.safeZodNullOrUndefined,
  overagePriceId: core.safeZodNullishString.describe(
    'The price to use when the usage exceeds the usage events per unit. If null, there is no overage price.'
  ),
  usageMeterId: core.safeZodNullOrUndefined,
  startsWithCreditTrial: z
    .boolean()
    .nullish()
    .transform((val) => val ?? null)
    .describe(
      'Whether or not subscriptions created from this price should automatically start with a credit trial. If true, the subscription will be created status "credit_trial".'
    ),
}

const usagePriceColumns = {
  ...subscriptionPriceColumns,
  overagePriceId: core.safeZodNullOrUndefined,
  trialPeriodDays: core.safeZodNullOrUndefined,
  setupFeeAmount: core.safeZodNullOrUndefined,
  usageMeterId: z
    .string()
    .describe(
      'The usage meter that uses this price. All usage events on that meter must be associated with a price that is also associated with that usage meter.'
    ),
  usageEventsPerUnit: core.safeZodPositiveInteger.describe(
    'The number of usage events per unit. Used to determine how to map usage events to quantities when raising invoices for usage.'
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
  usageMeterId: core.safeZodNullOrUndefined,
  usageEventsPerUnit: core.safeZodNullOrUndefined,
  overagePriceId: core.safeZodNullOrUndefined,
  startsWithCreditTrial: core.safeZodNullOrUndefined,
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

export const usagePriceClientInsertSchema = usagePriceInsertSchema
  .omit(nonClientEditableColumns)
  .describe(USAGE_PRICE_DESCRIPTION)
  .meta({ id: 'UsagePriceInsert' })

export const usagePriceClientUpdateSchema = usagePriceUpdateSchema
  .omit(nonClientEditableColumns)
  .describe(USAGE_PRICE_DESCRIPTION)
  .meta({ id: 'UsagePriceUpdate' })

export const usagePriceClientSelectSchema = usagePriceSelectSchema
  .omit(hiddenColumns)
  .describe(USAGE_PRICE_DESCRIPTION)
  .meta({ id: 'UsagePriceRecord' })

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
  subscriptionPriceInsertSchema.omit(nonClientEditableColumns).meta({
    id: 'SubscriptionPriceInsert',
  })

export const subscriptionPriceClientUpdateSchema =
  subscriptionPriceUpdateSchema.omit(nonClientEditableColumns).meta({
    id: 'SubscriptionPriceUpdate',
  })

export const subscriptionPriceClientSelectSchema =
  subscriptionPriceSelectSchema.omit(hiddenColumns).meta({
    id: 'SubscriptionPriceRecord',
  })

export const singlePaymentPriceClientSelectSchema =
  singlePaymentPriceSelectSchema.omit(hiddenColumns).meta({
    id: 'SinglePaymentPriceRecord',
  })

export const singlePaymentPriceClientInsertSchema =
  singlePaymentPriceInsertSchema.omit(nonClientEditableColumns).meta({
    id: 'SinglePaymentPriceInsert',
  })

export const singlePaymentPriceClientUpdateSchema =
  singlePaymentPriceUpdateSchema.omit(nonClientEditableColumns).meta({
    id: 'SinglePaymentPriceUpdate',
  })

export const pricesClientInsertSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientInsertSchema,
    singlePaymentPriceClientInsertSchema,
    usagePriceClientInsertSchema,
  ])
  .meta({
    id: 'PricesInsert',
  })

export const pricesClientUpdateSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientUpdateSchema,
    singlePaymentPriceClientUpdateSchema,
    usagePriceClientUpdateSchema,
  ])
  .meta({
    id: 'PricesUpdate',
  })

export const pricesClientSelectSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientSelectSchema,
    singlePaymentPriceClientSelectSchema,
    usagePriceClientSelectSchema,
  ])
  .meta({
    id: 'PriceRecord',
  })

export const pricesPaginatedSelectSchema =
  createPaginatedSelectSchema(
    z.object({
      productId: z.string().optional(),
      type: z.nativeEnum(PriceType).optional(),
      active: z.boolean().optional(),
    })
  ).meta({
    id: 'PricesPaginatedSelect',
  })

export const pricesPaginatedListSchema =
  createPaginatedListQuerySchema(pricesClientSelectSchema).meta({
    id: 'PricesPaginatedList',
  })

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
}

export const editPriceSchema = z.object({
  price: pricesClientUpdateSchema,
  id: z.string(),
})

export const editPriceFormSchema = editPriceSchema.extend({
  __rawPriceString: z.string(),
})

export type EditPriceFormSchema = z.infer<typeof editPriceFormSchema>

export type EditPriceInput = z.infer<typeof editPriceSchema>

export const createPriceSchema = z
  .object({
    price: pricesClientInsertSchema,
  })
  .meta({
    id: 'CreatePriceInput',
  })

export const createPriceFormSchema = createPriceSchema.extend({
  __rawPriceString: z.string(),
})

export type CreatePriceFormSchema = z.infer<
  typeof createPriceFormSchema
>

export type CreatePriceInput = z.infer<typeof createPriceSchema>

const omitProductId = {
  productId: true,
} as const

export const createProductPriceInputSchema = z
  .discriminatedUnion('type', [
    subscriptionPriceClientInsertSchema.omit(omitProductId).meta({
      id: 'ProductSubscriptionPriceInsert',
    }),
    singlePaymentPriceClientInsertSchema.omit(omitProductId).meta({
      id: 'ProductSinglePaymentPriceInsert',
    }),
    usagePriceClientInsertSchema.omit(omitProductId).meta({
      id: 'ProductUsagePriceInsert',
    }),
  ])
  .meta({
    id: 'CreateProductPriceInput',
  })

export const createProductSchema = z.object({
  product: productsClientInsertSchema,
  price: createProductPriceInputSchema,
  featureIds: z.array(z.string()).optional(),
})

export const createProductFormSchema = createProductSchema.extend({
  __rawPriceString: z.string(),
})

export type CreateProductFormSchema = z.infer<
  typeof createProductFormSchema
>

export type CreateProductPriceInput = z.infer<
  typeof createProductPriceInputSchema
>

export type CreateProductSchema = z.infer<typeof createProductSchema>

export const editProductSchema = z.object({
  product: productsClientUpdateSchema,
  price: pricesClientUpdateSchema.optional(),
  featureIds: z.array(z.string()).optional(),
  id: z.string(),
})

export const editProductFormSchema = editProductSchema.extend({
  __rawPriceString: z.string(),
})

export type EditProductFormSchema = z.infer<
  typeof editProductFormSchema
>

export type EditProductInput = z.infer<typeof editProductSchema>

export const productWithPricesSchema = productsClientSelectSchema
  .extend({
    prices: z.array(pricesClientSelectSchema),
    defaultPrice: pricesClientSelectSchema.describe(
      'The default price for the product. If no price is explicitly set as default, will return the first price created for the product..'
    ),
    features: z.array(featuresClientSelectSchema),
  })
  .meta({
    id: 'ProductWithPricesRecord',
  })

export type ProductWithPrices = z.infer<
  typeof productWithPricesSchema
>

export const pricingModelWithProductsAndUsageMetersSchema =
  pricingModelsClientSelectSchema.extend({
    products: z.array(productWithPricesSchema),
    usageMeters: z.array(usageMetersClientSelectSchema),
    defaultProduct: productWithPricesSchema
      .optional()
      .describe(
        'The default product for the pricing model. If no product is explicitly set as default, will return undefined.'
      ),
  })

export type PricingModelWithProductsAndUsageMeters = z.infer<
  typeof pricingModelWithProductsAndUsageMetersSchema
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
  pricingModel: pricingModelsClientSelectSchema.optional(),
})

export type ProductsTableRowData = z.infer<
  typeof productsTableRowDataSchema
>

export const subscriptionPriceDefaultColumns: Pick<
  Price.SubscriptionInsert,
  keyof typeof subscriptionPriceColumns
> = {
  ...nulledPriceColumns,
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
  setupFeeAmount: 0,
  trialPeriodDays: 0,
  type: PriceType.Subscription,
}

export const usagePriceDefaultColumns: Pick<
  Price.UsageInsert,
  keyof typeof usagePriceColumns
> = {
  ...subscriptionPriceDefaultColumns,
  setupFeeAmount: null,
  trialPeriodDays: null,
  type: PriceType.Usage,
  usageMeterId: '',
  usageEventsPerUnit: 1,
  overagePriceId: null,
}

export const singlePaymentPriceDefaultColumns: Pick<
  Price.SinglePaymentInsert,
  keyof typeof singlePaymentPriceColumns
> = {
  ...nulledPriceColumns,
  startsWithCreditTrial: null,
  type: PriceType.SinglePayment,
}
