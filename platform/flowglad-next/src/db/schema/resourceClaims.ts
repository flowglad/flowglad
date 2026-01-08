import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { organizations } from '@/db/schema/organizations'
import { pricingModels } from '@/db/schema/pricingModels'
import { resources } from '@/db/schema/resources'
import { subscriptionItemFeatures } from '@/db/schema/subscriptionItemFeatures'
import { subscriptions } from '@/db/schema/subscriptions'
import {
  constructIndex,
  enableCustomerReadPolicy,
  livemodePolicy,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'

const TABLE_NAME = 'resource_claims'

export const resourceClaims = pgTable(
  TABLE_NAME,
  {
    ...tableBase('res_claim'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    subscriptionItemFeatureId: notNullStringForeignKey(
      'subscription_item_feature_id',
      subscriptionItemFeatures
    ),
    resourceId: notNullStringForeignKey('resource_id', resources),
    subscriptionId: notNullStringForeignKey(
      'subscription_id',
      subscriptions
    ),
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
    externalId: text('external_id'),
    claimedAt: timestampWithTimezoneColumn('claimed_at')
      .notNull()
      .default(sql`now()`),
    releasedAt: timestampWithTimezoneColumn('released_at'),
    releaseReason: text('release_reason'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.resourceId]),
    constructIndex(TABLE_NAME, [table.subscriptionItemFeatureId]),
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    // Partial index for active claims only
    index('resource_claims_active_idx')
      .on(table.resourceId, table.subscriptionId)
      .where(sql`${table.releasedAt} IS NULL`),
    // Partial unique index for externalId uniqueness among active claims
    uniqueIndex('resource_claims_active_external_id_unique_idx')
      .on(table.resourceId, table.subscriptionId, table.externalId)
      .where(
        sql`${table.releasedAt} IS NULL AND ${table.externalId} IS NOT NULL`
      ),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: sql`"subscription_id" in (select "id" from "subscriptions")`,
      }
    ),
    enableCustomerReadPolicy(
      `Enable read for customers (${TABLE_NAME})`,
      {
        using: sql`"subscription_id" in (select "id" from "subscriptions")`,
      }
    ),
    livemodePolicy(TABLE_NAME),
  ]
).enableRLS()

const hiddenColumnsForClientSchema = {
  position: true,
  createdByCommit: true,
  updatedByCommit: true,
} as const

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  pricingModelId: true,
  subscriptionId: true,
  subscriptionItemFeatureId: true,
  resourceId: true,
  claimedAt: true,
} as const

const columnRefinements = {
  metadata: metadataSchema.nullable().optional(),
}

export const {
  select: resourceClaimsSelectSchema,
  insert: resourceClaimsInsertSchema,
  update: resourceClaimsUpdateSchema,
  client: {
    select: resourceClaimsClientSelectSchema,
    insert: resourceClaimsClientInsertSchema,
    update: resourceClaimsClientUpdateSchema,
  },
} = buildSchemas(resourceClaims, {
  refine: columnRefinements,
  client: {
    hiddenColumns: hiddenColumnsForClientSchema,
    readOnlyColumns,
  },
  entityName: 'ResourceClaim',
})

export namespace ResourceClaim {
  export type Insert = z.infer<typeof resourceClaimsInsertSchema>
  export type Update = z.infer<typeof resourceClaimsUpdateSchema>
  export type Record = z.infer<typeof resourceClaimsSelectSchema>
  export type ClientInsert = z.infer<
    typeof resourceClaimsClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof resourceClaimsClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof resourceClaimsClientSelectSchema
  >
  export type Where = SelectConditions<typeof resourceClaims>
}
