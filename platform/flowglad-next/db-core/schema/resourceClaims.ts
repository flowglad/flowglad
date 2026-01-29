import { sql } from 'drizzle-orm'
import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '../createZodSchemas'
import {
  constructIndex,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicyTable,
  merchantPolicy,
  metadataSchema,
  notNullStringForeignKey,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '../tableUtils'
import { organizations } from './organizations'
import { pricingModels } from './pricingModels'
import { resources } from './resources'
import { subscriptions } from './subscriptions'

const TABLE_NAME = 'resource_claims'

export const resourceClaims = pgTable(
  TABLE_NAME,
  {
    ...tableBase('res_claim'),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
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
    /**
     * Optional expiration timestamp for temporary claims.
     * Used when a claim is made during an interim period (e.g., between
     * scheduling a downgrade and when it takes effect). The claim remains
     * active until this timestamp, after which it's considered expired.
     * Active claims: releasedAt IS NULL AND (expiredAt IS NULL OR expiredAt > NOW())
     */
    expiredAt: timestampWithTimezoneColumn('expired_at'),
    metadata: jsonb('metadata'),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.subscriptionId]),
    constructIndex(TABLE_NAME, [table.resourceId]),
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
  ])
).enableRLS()

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
  claimedAt: true,
} as const

const createOnlyColumns = {
  resourceId: true,
  subscriptionId: true,
  pricingModelId: true,
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
    createOnlyColumns,
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
