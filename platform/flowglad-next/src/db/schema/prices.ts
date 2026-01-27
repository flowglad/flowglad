import { TRPCError } from '@trpc/server'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import {
  products,
  productsClientInsertSchema,
  productsClientSelectSchema,
  productsClientUpdateSchema,
} from '@/db/schema/products'
import {
  clientWriteOmitsConstructor,
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  createSupabaseWebhookSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  parentForeignKeyIntegrityCheckPolicy,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import core from '@/utils/core'
import { currencyCodeSchema } from '../commonZodSchema'
import { featuresClientSelectSchema } from './features'
import {
  pricingModels,
  pricingModelsClientSelectSchema,
} from './pricingModels'
import {
  usageMeters,
  usageMetersClientSelectSchema,
} from './usageMeters'

const readOnlyColumns = {
  currency: true,
  pricingModelId: true,
} as const

const createOnlyColumns = {
  productId: true,
  usageMeterId: true,
  usageEventsPerUnit: true,
  intervalUnit: true,
  intervalCount: true,
  trialPeriodDays: true,
  unitPrice: true,
} as const

export const priceImmutableFields = Object.keys(createOnlyColumns)

/**
 * Reserved suffix for auto-generated fallback prices on usage meters.
 * When a usage meter has no explicitly configured price, the system
 * generates a fallback price with this suffix (e.g., "api_requests_no_charge").
 *
 * Users cannot manually create usage prices with slugs ending in this suffix.
 */
export const RESERVED_USAGE_PRICE_SLUG_SUFFIX = '_no_charge' as const

/**
 * Check if a price slug uses the reserved `_no_charge` suffix.
 * This suffix is reserved for auto-generated fallback prices on usage meters.
 *
 * Note: This restriction applies ONLY to usage prices.
 * Subscription and single_payment prices can use any slug including `_no_charge` suffix.
 *
 * @param slug - The slug to check
 * @returns true if the slug ends with `_no_charge`
 */
export const isReservedPriceSlug = (slug: string): boolean => {
  return slug.endsWith(RESERVED_USAGE_PRICE_SLUG_SUFFIX)
}

/**
 * Validates that a usage price slug doesn't use reserved suffixes.
 * Throws TRPCError if validation fails.
 *
 * @param price - Price input with type and optional slug
 * @throws TRPCError with BAD_REQUEST if slug uses reserved suffix
 */
export const validateUsagePriceSlug = (price: {
  type: (typeof PriceType)[keyof typeof PriceType]
  slug?: string | null
}): void => {
  if (
    price.type === PriceType.Usage &&
    price.slug &&
    isReservedPriceSlug(price.slug)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Usage price slugs ending with "${RESERVED_USAGE_PRICE_SLUG_SUFFIX}" are reserved for auto-generated fallback prices`,
    })
  }
}

const hiddenColumns = {
  externalId: true,
  ...hiddenColumnsForClientSchema,
} as const

const TABLE_NAME = 'prices'

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
    productId: nullableStringForeignKey('product_id', products),
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
    slug: text('slug'),
    usageMeterId: nullableStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.type]),
    constructIndex(TABLE_NAME, [table.productId]),
    // externalId unique per product for non-usage prices
    uniqueIndex('prices_external_id_product_id_unique_idx')
      .on(table.externalId, table.productId)
      .where(sql`${table.type} != 'usage'`),
    // externalId unique per usage meter for usage prices
    uniqueIndex('prices_external_id_usage_meter_id_unique_idx')
      .on(table.externalId, table.usageMeterId)
      .where(sql`${table.type} = 'usage'`),
    // isDefault unique per product for non-usage prices
    uniqueIndex('prices_product_id_is_default_unique_idx')
      .on(table.productId)
      .where(sql`${table.isDefault} AND ${table.type} != 'usage'`),
    // isDefault unique per usage meter for usage prices
    uniqueIndex('prices_usage_meter_is_default_unique_idx')
      .on(table.usageMeterId)
      .where(sql`${table.isDefault} AND ${table.type} = 'usage'`),
    constructIndex(TABLE_NAME, [table.usageMeterId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    // Customer read access: handle both product prices and usage prices
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"active" = true AND (
            "product_id" IN (SELECT "id" FROM "products")
            OR ("product_id" IS NULL AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
          )`,
      }
    ),
    // Merchant access policy for prices.
    // Prices don't have an organization_id column - they're scoped to orgs
    // through their productId (for subscription/single_payment) or usageMeterId (for usage).
    // For usage prices: must have a visible usage_meter (RLS-scoped by org)
    // For non-usage prices: must have a visible product (RLS-scoped by org)
    // The withCheck also enforces pricing_model_id consistency on INSERT/UPDATE:
    // the price's pricing_model_id must match the parent (product or usage meter).
    merchantPolicy('Merchant access via product or usage meter FK', {
      as: 'permissive',
      to: 'merchant',
      for: 'all',
      using: sql`(
            ("type" = 'usage' AND "usage_meter_id" IN (SELECT "id" FROM "usage_meters"))
            OR ("type" != 'usage' AND "product_id" IN (SELECT "id" FROM "products"))
          )`,
      withCheck: sql`(
            ("type" = 'usage' AND "usage_meter_id" IN (
              SELECT "id" FROM "usage_meters"
              WHERE "usage_meters"."pricing_model_id" = "prices"."pricing_model_id"
            ))
            OR ("type" != 'usage' AND "product_id" IN (
              SELECT "id" FROM "products"
              WHERE "products"."pricing_model_id" = "prices"."pricing_model_id"
            ))
          )`,
    }),
    // CHECK constraint: enforce mutual exclusivity between productId and usageMeterId based on price type
    // Usage prices: must have usageMeterId, must NOT have productId
    // Non-usage prices: must have productId, must NOT have usageMeterId
    check(
      'prices_product_usage_meter_mutual_exclusivity',
      sql`(
        ("type" = 'usage' AND "product_id" IS NULL AND "usage_meter_id" IS NOT NULL)
        OR
        ("type" != 'usage' AND "product_id" IS NOT NULL AND "usage_meter_id" IS NULL)
      )`
    ),
  ])
).enableRLS()

export const nulledPriceColumns = {
  usageEventsPerUnit: null,
  usageMeterId: null,
  trialPeriodDays: null,
  intervalUnit: null,
  intervalCount: null,
}

const intervalZodSchema = core.createSafeZodEnum(IntervalUnit)

const basePriceColumns = {
  type: core.createSafeZodEnum(PriceType),
  isDefault: z
    .boolean()
    .describe(
      'Whether or not this price is the default price. For product prices, this indicates the default price for that product. For usage prices, this indicates the default price for that usage meter.'
    ),
  unitPrice: core.safeZodPositiveIntegerOrZero.describe(
    'The price per unit. This should be in the smallest unit of the currency. For example, if the currency is USD, GBP, CAD, EUR or SGD, the price should be in cents.'
  ),
  currency: currencyCodeSchema,
  usageEventsPerUnit: core.safeZodNullOrUndefined,
}

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
  trialPeriodDays: core.safeZodPositiveIntegerOrZero
    .nullable()
    .optional()
    .describe(
      'The trial period in days. If the trial period is 0 or null, there will be no trial period.'
    ),
  usageEventsPerUnit: core.safeZodNullOrUndefined,
  usageMeterId: core.safeZodNullOrUndefined,
  productId: z
    .string()
    .describe(
      'The product this price belongs to. Required for subscription prices.'
    ),
}

/**
 * Usage price columns.
 * Note: productId is null for usage prices - they belong to usage meters, not products.
 * - Insert: accepts null/undefined via safeZodNullOrUndefined
 * - Select (v2 strict): requires productId to be null, rejects non-null values
 */
const usagePriceColumns = {
  ...subscriptionPriceColumns,
  trialPeriodDays: core.safeZodNullOrUndefined,
  usageMeterId: z
    .string()
    .describe(
      'The usage meter that uses this price. All usage events on that meter must be associated with a price that is also associated with that usage meter.'
    ),
  usageEventsPerUnit: core.safeZodPositiveInteger.describe(
    'The number of usage events per unit. Used to determine how to map usage events to quantities when raising invoices for usage.'
  ),
  type: z.literal(PriceType.Usage),
  // Override productId: usage prices don't have a productId (it's null)
  // v2 strict: requires productId to be null, rejects non-null values
  productId: z.null(),
}

/**
 * Usage price insert-specific columns.
 * productId accepts null/undefined and always outputs null.
 */
const usagePriceInsertColumns = {
  productId: core.safeZodNullOrUndefined,
}

const USAGE_PRICE_DESCRIPTION =
  'A usage price, which describes the price per unit of usage of a product.'

const SUBSCRIPTION_PRICE_DESCRIPTION =
  'A subscription price, which will have details on the interval, default trial period, and setup fee (if any).'

// subtype schemas are built via buildSchemas below

const singlePaymentPriceColumns = {
  type: z.literal(PriceType.SinglePayment),
  intervalCount: core.safeZodNullOrUndefined.optional(),
  intervalUnit: core.safeZodNullOrUndefined.optional(),
  trialPeriodDays: core.safeZodNullOrUndefined.optional(),
  usageMeterId: core.safeZodNullOrUndefined.optional(),
  usageEventsPerUnit: core.safeZodNullOrUndefined.optional(),
  productId: z
    .string()
    .describe(
      'The product this price belongs to. Required for single payment prices.'
    ),
}

// subtype schemas are built via buildSchemas below

const PRICES_SELECT_SCHEMA_DESCRIPTION =
  'A price record, which describes a price for a product. Products can have multiple prices.'

const PRICES_INSERT_SCHEMA_DESCRIPTION =
  'A price record, which describes a price for a product. Products can have multiple prices.'

const PRICES_UPDATE_SCHEMA_DESCRIPTION =
  'A price record, which describes a price for a product. Products can have multiple prices.'

// Description constants for subscription creation input schema
export const PRICE_ID_DESCRIPTION =
  'The id of the price to subscribe to. If not provided, priceSlug is required. Used to determine whether the subscription is usage-based or not, and set other defaults such as trial period and billing intervals.'

export const PRICE_SLUG_DESCRIPTION =
  "The slug of the price to subscribe to. If not provided, priceId is required. Price slugs are scoped to the customer's pricing model. Used to determine whether the subscription is usage-based or not, and set other defaults such as trial period and billing intervals."

// subtype schemas are built via buildSchemas below

// ---------- buildSchemas subtypes (Subscription / SinglePayment / Usage) ----------
const subscriptionRefine = {
  ...basePriceColumns,
  ...subscriptionPriceColumns,
} as const

const singlePaymentRefine = {
  ...basePriceColumns,
  ...singlePaymentPriceColumns,
} as const

const usageRefine = {
  ...basePriceColumns,
  ...usagePriceColumns,
} as const

export const {
  insert: subscriptionPriceInsertSchema,
  select: subscriptionPriceSelectSchema,
  update: subscriptionPriceUpdateSchema,
  client: {
    insert: subscriptionPriceClientInsertSchema,
    select: subscriptionPriceClientSelectSchema,
    update: subscriptionPriceClientUpdateSchema,
  },
} = buildSchemas(prices, {
  discriminator: 'type',
  refine: subscriptionRefine,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'SubscriptionPrice',
})

export const {
  insert: singlePaymentPriceInsertSchema,
  select: singlePaymentPriceSelectSchema,
  update: singlePaymentPriceUpdateSchema,
  client: {
    insert: singlePaymentPriceClientInsertSchema,
    select: singlePaymentPriceClientSelectSchema,
    update: singlePaymentPriceClientUpdateSchema,
  },
} = buildSchemas(prices, {
  discriminator: 'type',
  refine: singlePaymentRefine,
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'SinglePaymentPrice',
})

export const {
  insert: usagePriceInsertSchema,
  select: usagePriceSelectSchema,
  update: usagePriceUpdateSchema,
  client: {
    insert: usagePriceClientInsertSchema,
    select: usagePriceClientSelectSchema,
    update: usagePriceClientUpdateSchema,
  },
} = buildSchemas(prices, {
  discriminator: 'type',
  refine: usageRefine,
  insertRefine: {
    pricingModelId: z.string().optional(),
    // For insert, usage prices should have null productId
    ...usagePriceInsertColumns,
  },
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
  entityName: 'UsagePrice',
})

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

export const pricesSelectClauseSchema = createSelectSchema(
  prices,
  basePriceColumns
)
  .omit({
    id: true,
  })
  .partial()

// client subtype schemas are provided by buildSchemas above

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
      type: z.enum(PriceType).optional(),
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

  /**
   * Type alias for prices that have a productId (subscription and single payment prices).
   * These prices are directly purchasable and can carry features.
   */
  export type ProductPrice = SubscriptionRecord | SinglePaymentRecord

  /**
   * Type alias for prices that belong to usage meters (usage prices).
   * These prices have productId = null and usageMeterId set.
   */
  export type UsageMeterPrice = UsageRecord

  /**
   * Type guard to check if a price has a productId.
   * Returns true for subscription and single payment prices.
   * Returns false for usage prices.
   *
   * @example
   * ```ts
   * if (Price.hasProductId(price)) {
   *   // price.productId is narrowed to string
   *   console.log(price.productId)
   * } else {
   *   // price.productId is null (usage price)
   * }
   * ```
   */
  export const hasProductId = (
    price: Record
  ): price is ProductPrice => {
    return price.type !== PriceType.Usage
  }

  /**
   * Type guard to check if a client price record has a productId.
   * Returns true for subscription and single payment prices.
   * Returns false for usage prices.
   */
  export const clientHasProductId = (
    price: ClientRecord
  ): price is
    | ClientSubscriptionRecord
    | ClientSinglePaymentRecord => {
    return price.type !== PriceType.Usage
  }

  /**
   * Type guard to check if a client price insert has a productId.
   * Returns true for subscription and single payment prices.
   * Returns false for usage prices.
   */
  export const clientInsertHasProductId = (
    price: ClientInsert
  ): price is
    | ClientSubscriptionInsert
    | ClientSinglePaymentInsert => {
    return price.type !== PriceType.Usage
  }
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
  price: pricesClientInsertSchema
    .optional()
    .describe(
      'The latest price fields. Ignored if the product is a default product for its pricing model.'
    ),
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

/**
 * Schema for usage meters with their associated prices.
 * Usage prices are now directly associated with usage meters (productId = null).
 */
export const usageMeterWithPricesSchema =
  usageMetersClientSelectSchema
    .extend({
      prices: z.array(usagePriceClientSelectSchema),
      defaultPrice: usagePriceClientSelectSchema
        .optional()
        .describe(
          'The default price for the usage meter. If no price is explicitly set as default, will return the first price.'
        ),
    })
    .meta({
      id: 'UsageMeterWithPricesRecord',
    })

export type UsageMeterWithPrices = z.infer<
  typeof usageMeterWithPricesSchema
>

export const pricingModelWithProductsAndUsageMetersSchema =
  pricingModelsClientSelectSchema
    .extend({
      products: z.array(productWithPricesSchema),
      usageMeters: z.array(usageMeterWithPricesSchema),
      defaultProduct: productWithPricesSchema
        .optional()
        .describe(
          'The default product for the pricing model. If no product is explicitly set as default, will return undefined.'
        ),
    })
    .meta({
      id: 'PricingModelDetailsRecord',
    })

export type PricingModelWithProductsAndUsageMeters = z.infer<
  typeof pricingModelWithProductsAndUsageMetersSchema
>

/**
 * Schema for price table row data.
 * Product is nullable because usage prices don't have a productId.
 */
export const pricesTableRowDataSchema = z.object({
  price: pricesClientSelectSchema,
  product: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
})

export const productsTableRowDataSchema = z.object({
  product: productsClientSelectSchema,
  prices: z.array(pricesClientSelectSchema),
  pricingModel: pricingModelsClientSelectSchema.optional(),
  /** Total revenue for this product (only populated when includeRevenueAggregates is true) */
  totalRevenue: z.number().optional(),
})

export type ProductsTableRowData = z.infer<
  typeof productsTableRowDataSchema
>

/**
 * Default columns for subscription prices.
 * productId is set to empty string as a placeholder - the actual value must be provided.
 */
export const subscriptionPriceDefaultColumns: Pick<
  Price.SubscriptionInsert,
  keyof typeof subscriptionPriceColumns
> = {
  ...nulledPriceColumns,
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
  trialPeriodDays: 0,
  type: PriceType.Subscription,
  productId: '', // Must be provided when creating price
}

/**
 * Default columns for usage prices.
 * productId is null for usage prices - they belong to usage meters, not products.
 */
export const usagePriceDefaultColumns: Pick<
  Price.UsageInsert,
  keyof typeof usagePriceColumns
> = {
  ...nulledPriceColumns,
  intervalCount: 1,
  intervalUnit: IntervalUnit.Month,
  trialPeriodDays: null,
  type: PriceType.Usage,
  usageMeterId: '',
  usageEventsPerUnit: 1,
  productId: null, // Usage prices don't have productId
}

/**
 * Default columns for single payment prices.
 * productId is set to empty string as a placeholder - the actual value must be provided.
 */
export const singlePaymentPriceDefaultColumns: Pick<
  Price.SinglePaymentInsert,
  keyof typeof singlePaymentPriceColumns
> = {
  ...nulledPriceColumns,
  type: PriceType.SinglePayment,
  productId: '', // Must be provided when creating price
}

/**
 * Schema for editing a usage price.
 * Used by the EditUsagePriceModal to update name, slug, and active status.
 * Price type, amount, usage events per unit, and usage meter are displayed but not editable
 * (changing them requires creating a new price).
 */
export const editUsagePriceSchema = z.object({
  price: usagePriceClientUpdateSchema,
  id: z.string(),
})

export const editUsagePriceFormSchema = editUsagePriceSchema.extend({
  __rawPriceString: z.string(),
})

export type EditUsagePriceFormSchema = z.infer<
  typeof editUsagePriceFormSchema
>

export type EditUsagePriceInput = z.infer<typeof editUsagePriceSchema>
