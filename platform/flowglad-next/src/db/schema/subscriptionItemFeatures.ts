import * as R from 'ramda'
import { z } from 'zod'
import { pgTable, integer, text, pgPolicy } from 'drizzle-orm/pg-core'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  constructUniqueIndex,
  livemodePolicy,
  pgEnumColumn,
  SelectConditions,
  hiddenColumnsForClientSchema as baseHiddenColumnsForClientSchema,
  timestampWithTimezoneColumn,
  ommittedColumnsForInsertSchema as baseOmittedColumnsForInsertSchema,
  parentForeignKeyIntegrityCheckPolicy,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import { features } from '@/db/schema/features'
import { productFeatures } from '@/db/schema/productFeatures'
import { usageMeters } from '@/db/schema/usageMeters'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import core, { zodOptionalNullableString } from '@/utils/core'
import { FeatureUsageGrantFrequency, FeatureType } from '@/types'
import { sql } from 'drizzle-orm'

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
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionItemId]),
    constructIndex(TABLE_NAME, [table.featureId]),
    constructIndex(TABLE_NAME, [table.productFeatureId]),
    constructIndex(TABLE_NAME, [table.type]),
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
    enableCustomerReadPolicy('Enable read for customers', {
      using: sql`"subscription_item_id" in (select "id" from "subscription_items") and "feature_id" in (select "id" from "features")`,
    }),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        to: 'merchant',
        for: 'select',
        using: sql`"subscription_item_id" in (select "id" from "subscription_items")`,
      }
    ),
    livemodePolicy(),
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
  detachedAt: z.date().nullable().optional(),
  detachedReason: zodOptionalNullableString,
}

/*
 * Core database schemas
 */
export const coreSubscriptionItemFeaturesInsertSchema =
  createInsertSchema(subscriptionItemFeatures)
    .omit(baseOmittedColumnsForInsertSchema)
    .extend(columnRefinements)

export const coreSubscriptionItemFeaturesSelectSchema =
  createSelectSchema(subscriptionItemFeatures).extend(
    columnRefinements
  )

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

export const toggleSubscriptionItemFeatureInsertSchema =
  coreSubscriptionItemFeaturesInsertSchema.extend(
    toggleSubscriptionItemFeatureSharedColumns
  )
export const toggleSubscriptionItemFeatureSelectSchema =
  coreSubscriptionItemFeaturesSelectSchema.extend(
    toggleSubscriptionItemFeatureSharedColumns
  )
export const toggleSubscriptionItemFeatureUpdateSchema =
  coreSubscriptionItemFeaturesUpdateSchema.extend(
    toggleSubscriptionItemFeatureSharedColumns
  )

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
export const usageCreditGrantSubscriptionItemFeatureInsertSchema =
  coreSubscriptionItemFeaturesInsertSchema.extend(
    usageCreditGrantSubscriptionItemFeatureSharedColumns
  )
export const usageCreditGrantSubscriptionItemFeatureSelectSchema =
  coreSubscriptionItemFeaturesSelectSchema.extend(
    usageCreditGrantSubscriptionItemFeatureSharedColumns
  )
export const usageCreditGrantSubscriptionItemFeatureUpdateSchema =
  coreSubscriptionItemFeaturesUpdateSchema.extend(
    usageCreditGrantSubscriptionItemFeatureSharedColumns
  )

/*
 * Combined discriminated union schemas (internal)
 */
export const subscriptionItemFeaturesInsertSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionItemFeatureInsertSchema,
    usageCreditGrantSubscriptionItemFeatureInsertSchema,
  ])

export const subscriptionItemFeaturesSelectSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionItemFeatureSelectSchema,
    usageCreditGrantSubscriptionItemFeatureSelectSchema,
  ])

export const subscriptionItemFeaturesUpdateSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionItemFeatureUpdateSchema,
    usageCreditGrantSubscriptionItemFeatureUpdateSchema,
  ])

const clientWriteOmitSpec = R.omit(
  [
    'id',
    'createdAt',
    'updatedAt',
    'createdByCommit',
    'updatedByCommit',
    'position',
  ],
  baseOmittedColumnsForInsertSchema
)

const clientSelectOmitSpec = {
  ...baseHiddenColumnsForClientSchema,
} as const

const clientSelectWithFeatureFieldRefinements = {
  name: z.string(),
  slug: z.string(),
}
/*
 * Client-facing Toggle SubscriptionItemFeature schemas
 */
export const toggleSubscriptionItemFeatureClientInsertSchema =
  toggleSubscriptionItemFeatureInsertSchema
    .omit(clientWriteOmitSpec)
    .extend(clientSelectWithFeatureFieldRefinements)
    .meta({ id: 'ToggleSubscriptionItemFeatureInsert' })

export const toggleSubscriptionItemFeatureClientSelectSchema =
  toggleSubscriptionItemFeatureSelectSchema
    .omit(clientSelectOmitSpec)
    .extend(clientSelectWithFeatureFieldRefinements)
    .meta({ id: 'ToggleSubscriptionItemFeatureRecord' })

export const toggleSubscriptionItemFeatureClientUpdateSchema =
  toggleSubscriptionItemFeatureUpdateSchema
    .partial()
    .extend({
      type: z.literal(FeatureType.Toggle),
    })
    .omit(clientWriteOmitSpec)
    .meta({ id: 'ToggleSubscriptionItemFeatureUpdate' })

/*
 * Client-facing Usage Credit Grant SubscriptionItemFeature schemas
 */
export const usageCreditGrantSubscriptionItemFeatureClientInsertSchema =
  usageCreditGrantSubscriptionItemFeatureInsertSchema
    .omit(clientWriteOmitSpec)
    .meta({ id: 'UsageCreditGrantSubscriptionItemFeatureInsert' })

export const usageCreditGrantSubscriptionItemFeatureClientSelectSchema =
  usageCreditGrantSubscriptionItemFeatureSelectSchema
    .omit(clientSelectOmitSpec)
    .meta({ id: 'UsageCreditGrantSubscriptionItemFeatureRecord' })

export const usageCreditGrantSubscriptionItemFeatureClientUpdateSchema =
  usageCreditGrantSubscriptionItemFeatureUpdateSchema
    .partial()
    .extend({
      type: z.literal(FeatureType.UsageCreditGrant),
    })
    .omit(clientWriteOmitSpec)
    .meta({ id: 'UsageCreditGrantSubscriptionItemFeatureUpdate' })

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
  expiredAt: z.date().optional(),
})

export type DeactivateSubscriptionItemFeatureInput = z.infer<
  typeof expireSubscriptionItemFeatureInputSchema
>
