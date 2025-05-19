import { pgTable, pgPolicy } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructUniqueIndex,
  enhancedCreateInsertSchema,
  createUpdateSchema,
  hiddenColumnsForClientSchema,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
} from '@/db/tableUtils'
import { products } from '@/db/schema/products'
import { features } from '@/db/schema/features'
import { createSelectSchema } from 'drizzle-zod'

const TABLE_NAME = 'product_features'

export const productFeatures = pgTable(
  TABLE_NAME,
  {
    ...tableBase('product_feature'),
    productId: notNullStringForeignKey('product_id', products),
    featureId: notNullStringForeignKey('feature_id', features),
  },
  (table) => {
    return [
      constructUniqueIndex(TABLE_NAME, [
        table.productId,
        table.featureId,
      ]),
      pgPolicy(
        'Enable access for own organizations and matching livemode',
        {
          as: 'permissive',
          to: 'authenticated',
          for: 'all',
          using: sql`EXISTS (
          SELECT 1
          FROM ${products} p
          JOIN organizations o ON p.organization_id = o.id
          JOIN memberships m ON o.id = m.organization_id
          WHERE
            p.id = ${table.productId} AND
            m.user_id = auth.uid() AND
            o.livemode = (
              SELECT org_focused.livemode
              FROM organizations org_focused
              JOIN memberships mem_focused ON org_focused.id = mem_focused.organization_id
              WHERE mem_focused.user_id = auth.uid() AND mem_focused.focused IS TRUE
              LIMIT 1
            )
        )`,
          // WITH CHECK is omitted for brevity but would use a similar condition for write operations
        }
      ),
    ]
  }
).enableRLS()

const columnRefinements = {} // No special column refinements for this table

/*
 * Core database schemas
 */
export const productFeaturesInsertSchema = enhancedCreateInsertSchema(
  productFeatures,
  columnRefinements
)

export const productFeaturesSelectSchema =
  createSelectSchema(productFeatures).extend(columnRefinements)

/*
 * Client-facing schemas
 */

// Columns that are part of productFeaturesInsertSchema but are set by the server or not applicable for client insert.
const serverSetColumnsForInsert = {
  livemode: true, // from tableBase, server will set this based on context
} as const

// Columns to hide from client when selecting/reading productFeature records.
const hiddenColumnsForSelect = {
  ...hiddenColumnsForClientSchema, // id, createdAt, updatedAt, createdByCommit, updatedByCommit, position
} as const

export const productFeatureClientInsertSchema =
  productFeaturesInsertSchema.omit(serverSetColumnsForInsert)

export const productFeatureClientSelectSchema =
  productFeaturesSelectSchema.omit(hiddenColumnsForSelect)

export namespace ProductFeature {
  export type Insert = z.infer<typeof productFeaturesInsertSchema>
  export type Record = z.infer<typeof productFeaturesSelectSchema>
  export type ClientInsert = z.infer<
    typeof productFeatureClientInsertSchema
  >
  export type ClientRecord = z.infer<
    typeof productFeatureClientSelectSchema
  >
  export type Where = SelectConditions<typeof productFeatures>
}

export const createProductFeatureInputSchema = z.object({
  productFeature: productFeatureClientInsertSchema,
})

export type CreateProductFeatureInput = z.infer<
  typeof createProductFeatureInputSchema
>

export const productFeaturesPaginatedSelectSchema =
  createPaginatedSelectSchema(productFeatureClientSelectSchema)

export const productFeaturesPaginatedListSchema =
  createPaginatedListQuerySchema(productFeatureClientSelectSchema)
