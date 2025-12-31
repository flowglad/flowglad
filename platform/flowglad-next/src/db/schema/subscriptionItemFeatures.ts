import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  pgPolicy,
  pgTable,
  text,
} from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import * as R from 'ramda'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { features } from '@/db/schema/features'
import { pricingModels } from '@/db/schema/pricingModels'
import { productFeatures } from '@/db/schema/productFeatures'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import { usageMeters } from '@/db/schema/usageMeters'
import {
  hiddenColumnsForClientSchema as baseHiddenColumnsForClientSchema,
  ommittedColumnsForInsertSchema as baseOmittedColumnsForInsertSchema,
  constructIndex,
  constructUniqueIndex,
  enableCustomerReadPolicy,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  parentForeignKeyIntegrityCheckPolicy,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import { zodEpochMs } from '@/db/timestampMs'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import core, { zodOptionalNullableString } from '@/utils/core'

const TABLE_NAME = 'subscription_item_features'

export const subscriptionItemFeatures = pgTable(
  TABLE_NAME,
  {
    ...tableBase('sub_feature'),
    subscriptionItemId: notNullStringForeignKey(
      'subscription_item_id',
      subscriptionItems
    ),
    featureId: notNullStringForeignKey('feature_id', features),
    productFeatureId: nullableStringForeignKey(
      'product_feature_id',
      productFeatures
    ),
    type: pgEnumColumn({
      enumName: 'FeatureType', // Re-using FeatureType enum
      columnName: 'type',
      enumBase: FeatureType,
    }).notNull(),
    amount: integer('amount'),
    usageMeterId: nullableStringForeignKey(
      'usage_meter_id',
      usageMeters
    ),
    renewalFrequency: pgEnumColumn({
      enumName: 'FeatureUsageGrantFrequency',
      columnName: 'renewal_frequency',
      enumBase: FeatureUsageGrantFrequency,
    }),
    expiredAt: timestampWithTimezoneColumn('expired_at'),
    detachedAt: timestampWithTimezoneColumn('detached_at'),
    detachedReason: text('detached_reason'),
    manuallyCreated: boolean('manually_created')
      .notNull()
      .default(false),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionItemId]),
    constructIndex(TABLE_NAME, [table.featureId]),
    constructIndex(TABLE_NAME, [table.productFeatureId]),
    constructIndex(TABLE_NAME, [table.type]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructUniqueIndex(TABLE_NAME, [
      table.featureId,
      table.subscriptionItemId,
    ]),
    parentForeignKeyIntegrityCheckPolicy({
      parentTableName: 'subscription_items',
      parentIdColumnInCurrentTable: 'subscription_item_id',
      currentTableName: TABLE_NAME,
    }),
    // Note: product_feature_id is nullable to support detached subscription item features
    // Foreign key integrity is still enforced at the database level when not null
    parentForeignKeyIntegrityCheckPolicy({
      parentTableName: 'features',
      parentIdColumnInCurrentTable: 'feature_id',
      currentTableName: TABLE_NAME,
    }),
    parentForeignKeyIntegrityCheckPolicy({
      parentTableName: 'usage_meters',
      parentIdColumnInCurrentTable: 'usage_meter_id',
      currentTableName: TABLE_NAME,
    }),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"subscription_item_id" in (select "id" from "subscription_items") and "feature_id" in (select "id" from "features")`,
      }
    ),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'merchant',
        for: 'select',
        using: sql`"subscription_item_id" in (select "id" from "subscription_items")`,
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
).enableRLS()

const columnRefinements = {
  type: core.createSafeZodEnum(FeatureType),
  renewalFrequency: core
    .createSafeZodEnum(FeatureUsageGrantFrequency)
    .nullable(),
  amount: z.number().int().nullable().optional(),
  usageMeterId: zodOptionalNullableString,
  productFeatureId: zodOptionalNullableString,
  detachedReason: zodOptionalNullableString,
}

/*
 * Core database schemas
 */
export const coreSubscriptionItemFeaturesSelectSchema =
  createSelectSchema(subscriptionItemFeatures).extend(
    columnRefinements
  )

export const coreSubscriptionItemFeaturesInsertSchema =
  createInsertSchema(subscriptionItemFeatures)
    .omit(baseOmittedColumnsForInsertSchema)
    .extend(columnRefinements)

export const coreSubscriptionItemFeaturesUpdateSchema =
  coreSubscriptionItemFeaturesInsertSchema
    .partial()
    .extend({ id: z.string() })

/*
 * Toggle SubscriptionItemFeature schemas
 */
const toggleSubscriptionItemFeatureSharedColumns = {
  type: z.literal(FeatureType.Toggle),
  amount: z.literal(null).optional(),
  usageMeterId: z.literal(null).optional(),
  renewalFrequency: z.literal(null).optional(),
}

export const {
  insert: toggleSubscriptionItemFeatureInsertSchema,
  select: toggleSubscriptionItemFeatureSelectSchema,
  update: toggleSubscriptionItemFeatureUpdateSchema,
  client: {
    insert: baseToggleSubscriptionItemFeatureClientInsertSchema,
    select: baseToggleSubscriptionItemFeatureClientSelectSchema,
    update: toggleSubscriptionItemFeatureClientUpdateSchema,
  },
} = buildSchemas(subscriptionItemFeatures, {
  discriminator: 'type',
  refine: {
    ...columnRefinements,
    ...toggleSubscriptionItemFeatureSharedColumns,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns: {
      ...baseHiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      pricingModelId: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'ToggleSubscriptionItemFeature',
})

/*
 * Usage Credit Grant SubscriptionItemFeature schemas
 */
const usageCreditGrantSubscriptionItemFeatureSharedColumns = {
  type: z.literal(FeatureType.UsageCreditGrant),
  amount: z.number().int(),
  usageMeterId: z.string(),
  renewalFrequency: core.createSafeZodEnum(
    FeatureUsageGrantFrequency
  ),
}
export const {
  insert: usageCreditGrantSubscriptionItemFeatureInsertSchema,
  select: usageCreditGrantSubscriptionItemFeatureSelectSchema,
  update: usageCreditGrantSubscriptionItemFeatureUpdateSchema,
  client: {
    insert:
      baseUsageCreditGrantSubscriptionItemFeatureClientInsertSchema,
    select:
      baseUsageCreditGrantSubscriptionItemFeatureClientSelectSchema,
    update: usageCreditGrantSubscriptionItemFeatureClientUpdateSchema,
  },
} = buildSchemas(subscriptionItemFeatures, {
  discriminator: 'type',
  refine: {
    ...columnRefinements,
    ...usageCreditGrantSubscriptionItemFeatureSharedColumns,
  },
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    hiddenColumns: {
      ...baseHiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      pricingModelId: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'UsageCreditGrantSubscriptionItemFeature',
})

/*
 * Combined discriminated union schemas (internal)
 */
export const subscriptionItemFeaturesInsertSchema = z
  .discriminatedUnion('type', [
    toggleSubscriptionItemFeatureInsertSchema,
    usageCreditGrantSubscriptionItemFeatureInsertSchema,
  ])
  .meta({ id: 'SubscriptionItemFeaturesInsertSchema' })

export const subscriptionItemFeaturesSelectSchema = z
  .discriminatedUnion('type', [
    toggleSubscriptionItemFeatureSelectSchema,
    usageCreditGrantSubscriptionItemFeatureSelectSchema,
  ])
  .meta({ id: 'SubscriptionItemFeaturesSelectSchema' })

export const subscriptionItemFeaturesUpdateSchema = z
  .discriminatedUnion('type', [
    toggleSubscriptionItemFeatureUpdateSchema,
    usageCreditGrantSubscriptionItemFeatureUpdateSchema,
  ])
  .meta({ id: 'SubscriptionItemFeaturesUpdateSchema' })

// augment generated client schemas with additional display fields
const clientSelectWithFeatureFieldRefinements = {
  name: z.string(),
  slug: z.string(),
}

export const toggleSubscriptionItemFeatureClientSelectSchema =
  baseToggleSubscriptionItemFeatureClientSelectSchema
    .extend(clientSelectWithFeatureFieldRefinements)
    .meta({ id: 'ToggleSubscriptionItemFeatureRecord' })

export const toggleSubscriptionItemFeatureClientInsertSchema =
  baseToggleSubscriptionItemFeatureClientInsertSchema
    .extend(clientSelectWithFeatureFieldRefinements)
    .meta({ id: 'ToggleSubscriptionItemFeatureInsert' })

export const usageCreditGrantSubscriptionItemFeatureClientSelectSchema =
  baseUsageCreditGrantSubscriptionItemFeatureClientSelectSchema
    .extend(clientSelectWithFeatureFieldRefinements)
    .meta({ id: 'UsageCreditGrantSubscriptionItemFeatureRecord' })

export const usageCreditGrantSubscriptionItemFeatureClientInsertSchema =
  baseUsageCreditGrantSubscriptionItemFeatureClientInsertSchema
    .extend(clientSelectWithFeatureFieldRefinements)
    .meta({ id: 'UsageCreditGrantSubscriptionItemFeatureInsert' })

/*
 * Combined client-facing discriminated union schemas
 */
export const subscriptionItemFeaturesClientInsertSchema = z
  .discriminatedUnion('type', [
    toggleSubscriptionItemFeatureClientInsertSchema,
    usageCreditGrantSubscriptionItemFeatureClientInsertSchema,
  ])
  .meta({ id: 'SubscriptionItemFeaturesClientInsertSchema' })

export const subscriptionItemFeaturesClientSelectSchema = z
  .discriminatedUnion('type', [
    toggleSubscriptionItemFeatureClientSelectSchema,
    usageCreditGrantSubscriptionItemFeatureClientSelectSchema,
  ])
  .meta({ id: 'SubscriptionItemFeaturesClientSelectSchema' })

export const subscriptionItemFeaturesClientUpdateSchema = z
  .discriminatedUnion('type', [
    toggleSubscriptionItemFeatureClientUpdateSchema,
    usageCreditGrantSubscriptionItemFeatureClientUpdateSchema,
  ])
  .meta({ id: 'SubscriptionItemFeaturesClientUpdateSchema' })

export namespace SubscriptionItemFeature {
  export type Insert = z.infer<
    typeof subscriptionItemFeaturesInsertSchema
  >
  export type Update = z.infer<
    typeof subscriptionItemFeaturesUpdateSchema
  >
  export type Record = z.infer<
    typeof subscriptionItemFeaturesSelectSchema
  >
  export type ClientInsert = z.infer<
    typeof subscriptionItemFeaturesClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof subscriptionItemFeaturesClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof subscriptionItemFeaturesClientSelectSchema
  >
  export type Where = SelectConditions<
    typeof subscriptionItemFeatures
  >

  // Toggle subtypes
  export type ToggleClientInsert = z.infer<
    typeof toggleSubscriptionItemFeatureClientInsertSchema
  >
  export type ToggleClientUpdate = z.infer<
    typeof toggleSubscriptionItemFeatureClientUpdateSchema
  >
  export type ToggleClientRecord = z.infer<
    typeof toggleSubscriptionItemFeatureClientSelectSchema
  >

  export type ToggleRecord = z.infer<
    typeof toggleSubscriptionItemFeatureSelectSchema
  >
  export type ToggleInsert = z.infer<
    typeof toggleSubscriptionItemFeatureInsertSchema
  >
  export type ToggleUpdate = z.infer<
    typeof toggleSubscriptionItemFeatureUpdateSchema
  >

  // UsageCreditGrant subtypes
  export type UsageCreditGrantClientInsert = z.infer<
    typeof usageCreditGrantSubscriptionItemFeatureClientInsertSchema
  >
  export type UsageCreditGrantClientUpdate = z.infer<
    typeof usageCreditGrantSubscriptionItemFeatureClientUpdateSchema
  >
  export type UsageCreditGrantClientRecord = z.infer<
    typeof usageCreditGrantSubscriptionItemFeatureClientSelectSchema
  >
  export type UsageCreditGrantRecord = z.infer<
    typeof usageCreditGrantSubscriptionItemFeatureSelectSchema
  >
  export type UsageCreditGrantInsert = z.infer<
    typeof usageCreditGrantSubscriptionItemFeatureInsertSchema
  >
  export type UsageCreditGrantUpdate = z.infer<
    typeof usageCreditGrantSubscriptionItemFeatureUpdateSchema
  >
}

export const createSubscriptionItemFeatureInputSchema = z.object({
  subscriptionItemFeature: subscriptionItemFeaturesClientInsertSchema,
})

export type CreateSubscriptionItemFeatureInput = z.infer<
  typeof createSubscriptionItemFeatureInputSchema
>

export const editSubscriptionItemFeatureInputSchema = z.object({
  id: z.string(),
  subscriptionItemFeature: subscriptionItemFeaturesClientUpdateSchema,
})

export type EditSubscriptionItemFeatureInput = z.infer<
  typeof editSubscriptionItemFeatureInputSchema
>

export const expireSubscriptionItemFeatureInputSchema = z.object({
  id: z.string(),
  expiredAt: zodEpochMs.optional(),
})

export type DeactivateSubscriptionItemFeatureInput = z.infer<
  typeof expireSubscriptionItemFeatureInputSchema
>

export const addFeatureToSubscriptionInputSchema = z.object({
  subscriptionItemId: z.string(),
  featureId: z.string(),
  grantCreditsImmediately: z.boolean().optional().default(false),
})

export type AddFeatureToSubscriptionInput = z.infer<
  typeof addFeatureToSubscriptionInputSchema
>

export const removeFeatureFromSubscriptionInputSchema = z.object({
  subscriptionItemId: z.string(),
  featureId: z.string(),
})

export type RemoveFeatureFromSubscriptionInput = z.infer<
  typeof removeFeatureFromSubscriptionInputSchema
>
