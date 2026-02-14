import { sql } from 'drizzle-orm'
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '../createZodSchemas'
import { FeatureType, FeatureUsageGrantFrequency } from '../enums'
import {
  constructIndex,
  constructUniqueIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  nullableStringForeignKey,
  orgIdEqualsCurrentSQL,
  pgEnumColumn,
  type SelectConditions,
  tableBase,
} from '../tableUtils'
import core, { safeZodSanitizedString } from '../utils'
import { organizations } from './organizations'
import { pricingModels } from './pricingModels'
import { resources } from './resources'
import { usageMeters } from './usageMeters'

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
    resourceId: nullableStringForeignKey('resource_id', resources),
    active: boolean('active').notNull().default(true),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.type]),
    constructUniqueIndex(TABLE_NAME, [
      table.organizationId,
      table.slug,
      table.pricingModelId,
    ]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    constructIndex(TABLE_NAME, [table.resourceId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"organization_id" = current_organization_id() and "active" = true`,
      }
    ),
  ])
).enableRLS()

/*
 * Toggle Feature schemas via buildSchemas
 */
const toggleFeatureSharedColumns = {
  type: z.literal(FeatureType.Toggle),
  amount: z.literal(null).optional(),
  usageMeterId: z.literal(null).optional(),
  renewalFrequency: z.literal(null).optional(),
  resourceId: z.literal(null).optional(),
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
  updateRefine: {
    slug: safeZodSanitizedString.optional(),
  },
  client: {
    hiddenColumns: hiddenColumnsForClientSchema,
    readOnlyColumns: { organizationId: true, pricingModelId: true },
  },
  entityName: 'ToggleFeature',
})

/*
 * Usage Credit Grant Feature schemas via buildSchemas
 */
const usageCreditGrantFeatureSharedColumns = {
  type: z.literal(FeatureType.UsageCreditGrant),
  amount: core.safeZodPositiveInteger,
  usageMeterId: z.string(),
  renewalFrequency: core.createSafeZodEnum(
    FeatureUsageGrantFrequency
  ),
  resourceId: z.literal(null).optional(),
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
  updateRefine: {
    slug: safeZodSanitizedString.optional(),
  },
  client: {
    hiddenColumns: hiddenColumnsForClientSchema,
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
      pricingModelId: true,
    },
  },
  entityName: 'UsageCreditGrantFeature',
})

/*
 * Resource Feature schemas via buildSchemas
 */
const resourceFeatureSharedColumns = {
  type: z.literal(FeatureType.Resource),
  amount: core.safeZodPositiveInteger,
  usageMeterId: z.literal(null).optional(),
  renewalFrequency: z.literal(null).optional(),
  resourceId: z.string(),
  slug: safeZodSanitizedString,
}

export const {
  insert: resourceFeatureInsertSchema,
  select: resourceFeatureSelectSchema,
  update: resourceFeatureUpdateSchema,
  client: {
    insert: resourceFeatureClientInsertSchema,
    select: resourceFeatureClientSelectSchema,
    update: resourceFeatureClientUpdateSchema,
  },
} = buildSchemas(features, {
  discriminator: 'type',
  refine: resourceFeatureSharedColumns,
  updateRefine: {
    slug: safeZodSanitizedString.optional(),
  },
  client: {
    hiddenColumns: hiddenColumnsForClientSchema,
    readOnlyColumns: {
      organizationId: true,
      livemode: true,
      pricingModelId: true,
    },
  },
  entityName: 'ResourceFeature',
})

/*
 * Combined discriminated union schemas (internal)
 */
export const featuresInsertSchema = z.discriminatedUnion('type', [
  toggleFeatureInsertSchema,
  usageCreditGrantFeatureInsertSchema,
  resourceFeatureInsertSchema,
])

export const featuresSelectSchema = z.discriminatedUnion('type', [
  toggleFeatureSelectSchema,
  usageCreditGrantFeatureSelectSchema,
  resourceFeatureSelectSchema,
])

export const featuresUpdateSchema = z.discriminatedUnion('type', [
  toggleFeatureUpdateSchema,
  usageCreditGrantFeatureUpdateSchema,
  resourceFeatureUpdateSchema,
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
    resourceFeatureClientInsertSchema,
  ])
  .meta({
    id: 'FeatureInsert',
  })

export const featuresClientSelectSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientSelectSchema,
    usageCreditGrantFeatureClientSelectSchema,
    resourceFeatureClientSelectSchema,
  ])
  .meta({
    id: 'FeatureRecord',
  })

export const featuresClientUpdateSchema = z
  .discriminatedUnion('type', [
    toggleFeatureClientUpdateSchema,
    usageCreditGrantFeatureClientUpdateSchema,
    resourceFeatureClientUpdateSchema,
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

  // Resource subtypes
  export type ResourceInsert = z.infer<
    typeof resourceFeatureInsertSchema
  >
  export type ResourceUpdate = z.infer<
    typeof resourceFeatureUpdateSchema
  >
  export type ResourceRecord = z.infer<
    typeof resourceFeatureSelectSchema
  >
  export type ResourceClientInsert = z.infer<
    typeof resourceFeatureClientInsertSchema
  >
  export type ResourceClientUpdate = z.infer<
    typeof resourceFeatureClientUpdateSchema
  >
  export type ResourceClientRecord = z.infer<
    typeof resourceFeatureClientSelectSchema
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
  resourceId: null,
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
  resourceId: null,
}

export const resourceFeatureDefaultColumns: Pick<
  Feature.ResourceInsert,
  /**
   * Note: ommitting slug and resourceId from default columns to avoid unexpected client side values
   */
  keyof Omit<
    typeof resourceFeatureSharedColumns,
    'slug' | 'resourceId'
  >
> = {
  type: FeatureType.Resource,
  amount: 0,
  usageMeterId: null,
  renewalFrequency: null,
}
