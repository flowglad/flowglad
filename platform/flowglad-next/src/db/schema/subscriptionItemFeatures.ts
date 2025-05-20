import * as R from 'ramda'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  text,
  pgTable,
  pgPolicy,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core'
import {
  tableBase,
  notNullStringForeignKey,
  nullableStringForeignKey,
  constructIndex,
  constructUniqueIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  livemodePolicy,
  pgEnumColumn,
  SelectConditions,
  hiddenColumnsForClientSchema as baseHiddenColumnsForClientSchema,
  timezoneWithTimestampColumn,
  ommittedColumnsForInsertSchema as baseOmittedColumnsForInsertSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations' // Needed for livemodePolicy
import { subscriptions } from '@/db/schema/subscriptions'
import { subscriptionItems } from '@/db/schema/subscriptionItems'
import { features } from '@/db/schema/features' // Assuming FeatureType is exported here
import { productFeatures } from '@/db/schema/productFeatures'
import { usageMeters } from '@/db/schema/usageMeters' // For usageMeterId foreign key
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { FeatureUsageGrantFrequency, FeatureType } from '@/types'

const TABLE_NAME = 'subscription_item_features'

export const subscriptionItemFeatures = pgTable(
  TABLE_NAME,
  {
    ...tableBase('sub_feature'), // Prefix for id, createdAt, etc.
    subscriptionItemId: notNullStringForeignKey(
      'subscription_item_id',
      subscriptionItems
    ),
    featureId: notNullStringForeignKey('feature_id', features),
    productFeatureId: notNullStringForeignKey(
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
    expiredAt: timezoneWithTimestampColumn('expired_at'),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionItemId]),
    constructIndex(TABLE_NAME, [table.featureId]),
    constructIndex(TABLE_NAME, [table.productFeatureId]),
    constructIndex(TABLE_NAME, [table.type]),
    constructUniqueIndex(TABLE_NAME, [
      table.productFeatureId,
      table.subscriptionItemId,
    ]),
    pgPolicy('Enable access for own organizations via subscription', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"subscription_id" IN (SELECT "id" FROM "subscriptions" WHERE "organization_id" IN (SELECT "organization_id" FROM "memberships"))`,
    }),
    livemodePolicy(),
  ]
).enableRLS()

const columnRefinements = {
  type: core.createSafeZodEnum(FeatureType),
  renewalFrequency: core
    .createSafeZodEnum(FeatureUsageGrantFrequency)
    .nullable(),
  amount: z.number().int().nullable(),
  usageMeterId: z.string().nullable(),
  deactivatedAt: core.safeZodDate.nullable(),
}

/*
 * Core database schemas
 */
export const coreSubscriptionItemFeaturesInsertSchema =
  enhancedCreateInsertSchema(
    subscriptionItemFeatures,
    columnRefinements
  )

export const coreSubscriptionItemFeaturesSelectSchema =
  createSelectSchema(subscriptionItemFeatures).extend(
    columnRefinements
  )

export const coreSubscriptionItemFeaturesUpdateSchema =
  createUpdateSchema(subscriptionItemFeatures, columnRefinements)

/*
 * Toggle SubscriptionItemFeature schemas
 */
const toggleSubscriptionItemFeatureSharedColumns = {
  type: z.literal(FeatureType.Toggle),
  amount: z.literal(null).nullable(),
  usageMeterId: z.literal(null).nullable(),
  renewalFrequency: z.literal(null).nullable(),
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

/*
 * Client-facing Toggle SubscriptionItemFeature schemas
 */
export const toggleSubscriptionItemFeatureClientInsertSchema =
  toggleSubscriptionItemFeatureInsertSchema.omit(clientWriteOmitSpec)

export const toggleSubscriptionItemFeatureClientSelectSchema =
  toggleSubscriptionItemFeatureSelectSchema.omit(clientSelectOmitSpec)

export const toggleSubscriptionItemFeatureClientUpdateSchema =
  toggleSubscriptionItemFeatureUpdateSchema
    .partial()
    .extend({
      type: z.literal(FeatureType.Toggle),
    })
    .omit(clientWriteOmitSpec)

/*
 * Client-facing Usage Credit Grant SubscriptionItemFeature schemas
 */
export const usageCreditGrantSubscriptionItemFeatureClientInsertSchema =
  usageCreditGrantSubscriptionItemFeatureInsertSchema.omit(
    clientWriteOmitSpec
  )

export const usageCreditGrantSubscriptionItemFeatureClientSelectSchema =
  usageCreditGrantSubscriptionItemFeatureSelectSchema.omit(
    clientSelectOmitSpec
  )

export const usageCreditGrantSubscriptionItemFeatureClientUpdateSchema =
  usageCreditGrantSubscriptionItemFeatureUpdateSchema
    .partial()
    .extend({
      type: z.literal(FeatureType.UsageCreditGrant),
    })
    .omit(clientWriteOmitSpec)

/*
 * Combined client-facing discriminated union schemas
 */
export const subscriptionItemFeaturesClientInsertSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionItemFeatureClientInsertSchema,
    usageCreditGrantSubscriptionItemFeatureClientInsertSchema,
  ])

export const subscriptionItemFeaturesClientSelectSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionItemFeatureClientSelectSchema,
    usageCreditGrantSubscriptionItemFeatureClientSelectSchema,
  ])

export const subscriptionItemFeaturesClientUpdateSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionItemFeatureClientUpdateSchema,
    usageCreditGrantSubscriptionItemFeatureClientUpdateSchema,
  ])

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
