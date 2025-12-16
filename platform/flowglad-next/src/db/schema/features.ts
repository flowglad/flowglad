import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import { usageMeters } from '@/db/schema/usageMeters'
import {
  constructIndex,
  constructUniqueIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '@/db/tableUtils'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import core, { safeZodSanitizedString } from '@/utils/core'
import { pricingModels } from './pricingModels'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.type]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.slug,
      table.pricingModelId,
    ]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }
    ),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"organization_id" = current_organization_id() and "active" = true`,
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
).enableRLS()

/*
 * Toggle Feature schemas via buildSchemas
 */
const toggleFeatureSharedColumns = {
  type: z.literal(FeatureType.Toggle),
  amount: z.literal(null).optional(),
  usageMeterId: z.literal(null).optional(),
  renewalFrequency: z.literal(null).optional(),
  slug: safeZodSanitizedString,
}

export const {
  insert: toggleFeatureInsertSchema,
  select: toggleFeatureSelectSchema,
  update: toggleFeatureUpdateSchema,
  client: {
    insert: toggleFeatureClientInsertSchema,
    select: toggleFeatureClientSelectSchema,
    update: toggleFeatureClientUpdateSchema,
  },
} = buildSchemas(features, {
  discriminator: 'type',
  refine: toggleFeatureSharedColumns,
  client: {
    hiddenColumns: hiddenColumnsForClientSchema,
    readOnlyColumns: { organizationId: true },
  },
  entityName: 'ToggleFeature',
})

/*
 * Usage Credit Grant Feature schemas via buildSchemas
 */
const usageCreditGrantFeatureSharedColumns = {
  type: z.literal(FeatureType.UsageCreditGrant),
  amount: z.number().int(),
  usageMeterId: z.string(),
  renewalFrequency: core.createSafeZodEnum(
    FeatureUsageGrantFrequency
  ),
  slug: safeZodSanitizedString,
}

export const {
  insert: usageCreditGrantFeatureInsertSchema,
  select: usageCreditGrantFeatureSelectSchema,
  update: usageCreditGrantFeatureUpdateSchema,
  client: {
    insert: usageCreditGrantFeatureClientInsertSchema,
    select: usageCreditGrantFeatureClientSelectSchema,
    update: usageCreditGrantFeatureClientUpdateSchema,
  },
} = buildSchemas(features, {
  discriminator: 'type',
  refine: usageCreditGrantFeatureSharedColumns,
  client: {
    hiddenColumns: hiddenColumnsForClientSchema,
    readOnlyColumns: { organizationId: true, livemode: true },
  },
  entityName: 'UsageCreditGrantFeature',
})

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

/*
 * Combined client-facing discriminated union schemas
 */
export const featuresClientInsertSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientInsertSchema,
    usageCreditGrantFeatureClientInsertSchema,
  ])
  .meta({
    id: 'FeatureInsert',
  })

export const featuresClientSelectSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientSelectSchema,
    usageCreditGrantFeatureClientSelectSchema,
  ])
  .meta({
    id: 'FeatureRecord',
  })

export const featuresClientUpdateSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientUpdateSchema,
    usageCreditGrantFeatureClientUpdateSchema,
  ])
  .meta({
    id: 'FeatureUpdate',
  })

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
  export type ToggleInsert = z.infer<typeof toggleFeatureInsertSchema>
  export type ToggleUpdate = z.infer<typeof toggleFeatureUpdateSchema>
  export type ToggleRecord = z.infer<typeof toggleFeatureSelectSchema>
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
  export type UsageCreditGrantInsert = z.infer<
    typeof usageCreditGrantFeatureInsertSchema
  >
  export type UsageCreditGrantUpdate = z.infer<
    typeof usageCreditGrantFeatureUpdateSchema
  >
  export type UsageCreditGrantRecord = z.infer<
    typeof usageCreditGrantFeatureSelectSchema
  >
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

export const toggleFeatureDefaultColumns: Pick<
  Feature.ToggleInsert,
  /**
   * Note: ommitting slug from default columns to avoid unexpected client side values
   */
  keyof Omit<typeof toggleFeatureSharedColumns, 'slug'>
> = {
  type: FeatureType.Toggle,
  amount: null,
  usageMeterId: null,
  renewalFrequency: null,
}

export const usageCreditGrantFeatureDefaultColumns: Pick<
  Feature.UsageCreditGrantInsert,
  /**
   * Note: ommitting slug from default columns to avoid unexpected client side values
   */
  keyof Omit<typeof usageCreditGrantFeatureSharedColumns, 'slug'>
> = {
  type: FeatureType.UsageCreditGrant,
  amount: 0,
  usageMeterId: '',
  renewalFrequency: FeatureUsageGrantFrequency.EveryBillingPeriod,
}
