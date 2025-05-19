import * as R from 'ramda'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { text, pgTable, pgPolicy, integer } from 'drizzle-orm/pg-core'
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
  hiddenColumnsForClientSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { usageMeters } from '@/db/schema/usageMeters'
import { createSelectSchema } from 'drizzle-zod'
import core from '@/utils/core'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'

const TABLE_NAME = 'features'

export const features = pgTable(
  TABLE_NAME,
  {
    ...tableBase('feature'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    type: pgEnumColumn({
      enumName: 'FeatureType',
      columnName: 'type',
      enumBase: FeatureType,
    }).notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
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
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.type]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.slug,
    ]),
    pgPolicy('Enable read for own organizations', {
      as: 'permissive',
      to: 'authenticated',
      for: 'all',
      using: sql`"organization_id" in (select "organization_id" from "memberships")`,
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
}

/*
 * Core database schemas
 */
export const coreFeaturesInsertSchema = enhancedCreateInsertSchema(
  features,
  columnRefinements
)

export const coreFeaturesSelectSchema =
  createSelectSchema(features).extend(columnRefinements)

export const coreFeaturesUpdateSchema = createUpdateSchema(
  features,
  columnRefinements
)

/*
 * Toggle Feature schemas
 */
const toggleFeatureSharedColumns = {
  type: z.literal(FeatureType.Toggle),
  amount: z.literal(null).nullable(),
  usageMeterId: z.literal(null).nullable(),
  renewalFrequency: z.literal(null).nullable(),
}

export const toggleFeatureInsertSchema =
  coreFeaturesInsertSchema.extend(toggleFeatureSharedColumns)
export const toggleFeatureSelectSchema =
  coreFeaturesSelectSchema.extend(toggleFeatureSharedColumns)
export const toggleFeatureUpdateSchema =
  coreFeaturesUpdateSchema.extend(toggleFeatureSharedColumns)

/*
 * Usage Credit Grant Feature schemas
 */
const usageCreditGrantFeatureSharedColumns = {
  type: z.literal(FeatureType.UsageCreditGrant),
  amount: z.number().int(),
  usageMeterId: z.string(),
  renewalFrequency: core.createSafeZodEnum(
    FeatureUsageGrantFrequency
  ),
}
export const usageCreditGrantFeatureInsertSchema =
  coreFeaturesInsertSchema.extend(
    usageCreditGrantFeatureSharedColumns
  )
export const usageCreditGrantFeatureSelectSchema =
  coreFeaturesSelectSchema.extend(
    usageCreditGrantFeatureSharedColumns
  )
export const usageCreditGrantFeatureUpdateSchema =
  coreFeaturesUpdateSchema.extend(
    usageCreditGrantFeatureSharedColumns
  )

/*
 * Combined discriminated union schemas (internal)
 */
export const featuresInsertSchema = z.discriminatedUnion('type', [
  toggleFeatureInsertSchema,
  usageCreditGrantFeatureInsertSchema,
])

export const featuresSelectSchema = z.discriminatedUnion('type', [
  toggleFeatureSelectSchema,
  usageCreditGrantFeatureSelectSchema,
])

export const featuresUpdateSchema = z.discriminatedUnion('type', [
  toggleFeatureUpdateSchema,
  usageCreditGrantFeatureUpdateSchema,
])

const sharedHiddenClientColumns = {
  ...hiddenColumnsForClientSchema, // id, createdAt, updatedAt, createdByCommit, updatedByCommit, position
} as const

// Columns to omit for client create/update operations THAT ARE PART OF THE CORE ZOD SCHEMA
const clientWriteOmitColumns = {
  organizationId: true,
} as const

/*
 * Client-facing Toggle Feature schemas
 */
// For insert, omit fields set by the backend. Retain 'type' for discriminated union.
export const toggleFeatureClientInsertSchema =
  toggleFeatureInsertSchema.omit({
    ...clientWriteOmitColumns,
  })
export const toggleFeatureClientSelectSchema =
  toggleFeatureSelectSchema.omit(
    sharedHiddenClientColumns // Only hide truly internal fields for select
  )
// For update, omit fields set by the backend. Retain 'type' and 'id' (id is in input schema).
export const toggleFeatureClientUpdateSchema =
  toggleFeatureUpdateSchema.omit(clientWriteOmitColumns)

/*
 * Client-facing Usage Credit Grant Feature schemas
 */
export const usageCreditGrantFeatureClientInsertSchema =
  usageCreditGrantFeatureInsertSchema.omit(clientWriteOmitColumns)

export const usageCreditGrantFeatureClientSelectSchema =
  usageCreditGrantFeatureSelectSchema.omit(
    sharedHiddenClientColumns // Only hide truly internal fields for select
  )

export const usageCreditGrantFeatureClientUpdateSchema =
  usageCreditGrantFeatureUpdateSchema.omit({
    organizationId: true,
    livemode: true,
  })

/*
 * Combined client-facing discriminated union schemas
 */
export const featuresClientInsertSchema = z.discriminatedUnion(
  'type',
  [
    toggleFeatureClientInsertSchema,
    usageCreditGrantFeatureClientInsertSchema,
  ]
)

export const featuresClientSelectSchema = z.discriminatedUnion(
  'type',
  [
    toggleFeatureClientSelectSchema,
    usageCreditGrantFeatureClientSelectSchema,
  ]
)

export const featuresClientUpdateSchema = z.discriminatedUnion(
  'type',
  [
    toggleFeatureClientUpdateSchema,
    usageCreditGrantFeatureClientUpdateSchema,
  ]
)

export namespace Feature {
  export type Insert = z.infer<typeof featuresInsertSchema>
  export type Update = z.infer<typeof featuresUpdateSchema>
  export type Record = z.infer<typeof featuresSelectSchema>
  export type ClientInsert = z.infer<
    typeof featuresClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof featuresClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof featuresClientSelectSchema
  >
  export type Where = SelectConditions<typeof features>

  // Toggle subtypes
  export type ToggleClientInsert = z.infer<
    typeof toggleFeatureClientInsertSchema
  >
  export type ToggleClientUpdate = z.infer<
    typeof toggleFeatureClientUpdateSchema
  >
  export type ToggleClientRecord = z.infer<
    typeof toggleFeatureClientSelectSchema
  >

  // UsageCreditGrant subtypes
  export type UsageCreditGrantClientInsert = z.infer<
    typeof usageCreditGrantFeatureClientInsertSchema
  >
  export type UsageCreditGrantClientUpdate = z.infer<
    typeof usageCreditGrantFeatureClientUpdateSchema
  >
  export type UsageCreditGrantClientRecord = z.infer<
    typeof usageCreditGrantFeatureClientSelectSchema
  >
}

export const createFeatureSchema = z.object({
  feature: featuresClientInsertSchema,
})

export type CreateFeatureInput = z.infer<typeof createFeatureSchema>

export const editFeatureSchema = z.object({
  id: z.string(),
  feature: featuresClientUpdateSchema,
})

export type EditFeatureInput = z.infer<typeof editFeatureSchema>
