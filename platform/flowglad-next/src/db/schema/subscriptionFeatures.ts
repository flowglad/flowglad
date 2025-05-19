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
import { features } from '@/db/schema/features' // Assuming FeatureType is exported here
import { productFeatures } from '@/db/schema/productFeatures'
import { usageMeters } from '@/db/schema/usageMeters' // For usageMeterId foreign key
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { FeatureUsageGrantFrequency, FeatureType } from '@/types'

const TABLE_NAME = 'subscription_features'

export const subscriptionFeatures = pgTable(
  TABLE_NAME,
  {
    ...tableBase('sub_feature'), // Prefix for id, createdAt, etc.
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
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
    deactivatedAt: timezoneWithTimestampColumn('deactivated_at'),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.featureId]),
    constructIndex(TABLE_NAME, [table.productFeatureId]),
    constructIndex(TABLE_NAME, [table.type]),
    constructUniqueIndex(TABLE_NAME, [
      table.productFeatureId,
      table.subscriptionId,
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
export const coreSubscriptionFeaturesInsertSchema =
  enhancedCreateInsertSchema(subscriptionFeatures, columnRefinements)

export const coreSubscriptionFeaturesSelectSchema =
  createSelectSchema(subscriptionFeatures).extend(columnRefinements)

export const coreSubscriptionFeaturesUpdateSchema =
  createUpdateSchema(subscriptionFeatures, columnRefinements)

/*
 * Toggle SubscriptionFeature schemas
 */
const toggleSubscriptionFeatureSharedColumns = {
  type: z.literal(FeatureType.Toggle),
  amount: z.literal(null).nullable(),
  usageMeterId: z.literal(null).nullable(),
  renewalFrequency: z.literal(null).nullable(),
}

export const toggleSubscriptionFeatureInsertSchema =
  coreSubscriptionFeaturesInsertSchema.extend(
    toggleSubscriptionFeatureSharedColumns
  )
export const toggleSubscriptionFeatureSelectSchema =
  coreSubscriptionFeaturesSelectSchema.extend(
    toggleSubscriptionFeatureSharedColumns
  )
export const toggleSubscriptionFeatureUpdateSchema =
  coreSubscriptionFeaturesUpdateSchema.extend(
    toggleSubscriptionFeatureSharedColumns
  )

/*
 * Usage Credit Grant SubscriptionFeature schemas
 */
const usageCreditGrantSubscriptionFeatureSharedColumns = {
  type: z.literal(FeatureType.UsageCreditGrant),
  amount: z.number().int(),
  usageMeterId: z.string(),
  renewalFrequency: core.createSafeZodEnum(
    FeatureUsageGrantFrequency
  ),
}
export const usageCreditGrantSubscriptionFeatureInsertSchema =
  coreSubscriptionFeaturesInsertSchema.extend(
    usageCreditGrantSubscriptionFeatureSharedColumns
  )
export const usageCreditGrantSubscriptionFeatureSelectSchema =
  coreSubscriptionFeaturesSelectSchema.extend(
    usageCreditGrantSubscriptionFeatureSharedColumns
  )
export const usageCreditGrantSubscriptionFeatureUpdateSchema =
  coreSubscriptionFeaturesUpdateSchema.extend(
    usageCreditGrantSubscriptionFeatureSharedColumns
  )

/*
 * Combined discriminated union schemas (internal)
 */
export const subscriptionFeaturesInsertSchema = z.discriminatedUnion(
  'type',
  [
    toggleSubscriptionFeatureInsertSchema,
    usageCreditGrantSubscriptionFeatureInsertSchema,
  ]
)

export const subscriptionFeaturesSelectSchema = z.discriminatedUnion(
  'type',
  [
    toggleSubscriptionFeatureSelectSchema,
    usageCreditGrantSubscriptionFeatureSelectSchema,
  ]
)

export const subscriptionFeaturesUpdateSchema = z.discriminatedUnion(
  'type',
  [
    toggleSubscriptionFeatureUpdateSchema,
    usageCreditGrantSubscriptionFeatureUpdateSchema,
  ]
)

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
 * Client-facing Toggle SubscriptionFeature schemas
 */
export const toggleSubscriptionFeatureClientInsertSchema =
  toggleSubscriptionFeatureInsertSchema.omit(clientWriteOmitSpec)

export const toggleSubscriptionFeatureClientSelectSchema =
  toggleSubscriptionFeatureSelectSchema.omit(clientSelectOmitSpec)

export const toggleSubscriptionFeatureClientUpdateSchema =
  toggleSubscriptionFeatureUpdateSchema
    .partial()
    .extend({
      type: z.literal(FeatureType.Toggle),
    })
    .omit(clientWriteOmitSpec)

/*
 * Client-facing Usage Credit Grant SubscriptionFeature schemas
 */
export const usageCreditGrantSubscriptionFeatureClientInsertSchema =
  usageCreditGrantSubscriptionFeatureInsertSchema.omit(
    clientWriteOmitSpec
  )

export const usageCreditGrantSubscriptionFeatureClientSelectSchema =
  usageCreditGrantSubscriptionFeatureSelectSchema.omit(
    clientSelectOmitSpec
  )

export const usageCreditGrantSubscriptionFeatureClientUpdateSchema =
  usageCreditGrantSubscriptionFeatureUpdateSchema
    .partial()
    .extend({
      type: z.literal(FeatureType.UsageCreditGrant),
    })
    .omit(clientWriteOmitSpec)

/*
 * Combined client-facing discriminated union schemas
 */
export const subscriptionFeaturesClientInsertSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionFeatureClientInsertSchema,
    usageCreditGrantSubscriptionFeatureClientInsertSchema,
  ])

export const subscriptionFeaturesClientSelectSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionFeatureClientSelectSchema,
    usageCreditGrantSubscriptionFeatureClientSelectSchema,
  ])

export const subscriptionFeaturesClientUpdateSchema =
  z.discriminatedUnion('type', [
    toggleSubscriptionFeatureClientUpdateSchema,
    usageCreditGrantSubscriptionFeatureClientUpdateSchema,
  ])

export namespace SubscriptionFeature {
  export type Insert = z.infer<
    typeof subscriptionFeaturesInsertSchema
  >
  export type Update = z.infer<
    typeof subscriptionFeaturesUpdateSchema
  >
  export type Record = z.infer<
    typeof subscriptionFeaturesSelectSchema
  >
  export type ClientInsert = z.infer<
    typeof subscriptionFeaturesClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof subscriptionFeaturesClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof subscriptionFeaturesClientSelectSchema
  >
  export type Where = SelectConditions<typeof subscriptionFeatures>

  // Toggle subtypes
  export type ToggleClientInsert = z.infer<
    typeof toggleSubscriptionFeatureClientInsertSchema
  >
  export type ToggleClientUpdate = z.infer<
    typeof toggleSubscriptionFeatureClientUpdateSchema
  >
  export type ToggleClientRecord = z.infer<
    typeof toggleSubscriptionFeatureClientSelectSchema
  >

  // UsageCreditGrant subtypes
  export type UsageCreditGrantClientInsert = z.infer<
    typeof usageCreditGrantSubscriptionFeatureClientInsertSchema
  >
  export type UsageCreditGrantClientUpdate = z.infer<
    typeof usageCreditGrantSubscriptionFeatureClientUpdateSchema
  >
  export type UsageCreditGrantClientRecord = z.infer<
    typeof usageCreditGrantSubscriptionFeatureClientSelectSchema
  >
}

export const createSubscriptionFeatureInputSchema = z.object({
  subscriptionFeature: subscriptionFeaturesClientInsertSchema,
})

export type CreateSubscriptionFeatureInput = z.infer<
  typeof createSubscriptionFeatureInputSchema
>

export const editSubscriptionFeatureInputSchema = z.object({
  id: z.string(),
  subscriptionFeature: subscriptionFeaturesClientUpdateSchema,
})

export type EditSubscriptionFeatureInput = z.infer<
  typeof editSubscriptionFeatureInputSchema
>

export const deactivateSubscriptionFeatureInputSchema = z.object({
  id: z.string(),
  deactivatedAt: z.date().optional(),
})

export type DeactivateSubscriptionFeatureInput = z.infer<
  typeof deactivateSubscriptionFeatureInputSchema
>
