import { pgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructUniqueIndex,
  ommittedColumnsForInsertSchema,
  hiddenColumnsForClientSchema,
  createPaginatedSelectSchema,
  createPaginatedListQuerySchema,
  SelectConditions,
  livemodePolicy,
  timestampWithTimezoneColumn,
  constructIndex,
  membershipOrganizationIdIntegrityCheckPolicy,
  parentForeignKeyIntegrityCheckPolicy,
  merchantPolicy,
  enableCustomerReadPolicy,
} from '@/db/tableUtils'
import { products } from '@/db/schema/products'
import { features } from '@/db/schema/features'
import { createSelectSchema, createInsertSchema } from 'drizzle-zod'
import { organizations } from '@/db/schema/organizations'
const TABLE_NAME = 'product_features'

export const productFeatures = pgTable(
  TABLE_NAME,
  {
    ...tableBase('product_feature'),
    productId: notNullStringForeignKey('product_id', products),
    featureId: notNullStringForeignKey('feature_id', features),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    expiredAt: timestampWithTimezoneColumn('expired_at'),
  },
  (table) => {
    return [
      constructUniqueIndex(TABLE_NAME, [
        table.productId,
        table.featureId,
      ]),
      constructIndex(TABLE_NAME, [table.productId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      membershipOrganizationIdIntegrityCheckPolicy(),
      enableCustomerReadPolicy(`Enable read for customers (${TABLE_NAME})`, {
        using: sql`"product_id" in (select "id" from "products")`,
      }),
      parentForeignKeyIntegrityCheckPolicy({
        parentTableName: 'products',
        parentIdColumnInCurrentTable: 'product_id',
        currentTableName: TABLE_NAME,
      }),
      merchantPolicy(
        `Enable read for own organizations (${TABLE_NAME})`,
        {
          as: 'permissive',
          for: 'all',
          using: sql`"organization_id" in (select "organization_id" from "memberships")`,
        }
      ),
      parentForeignKeyIntegrityCheckPolicy({
        parentTableName: 'features',
        parentIdColumnInCurrentTable: 'feature_id',
        currentTableName: TABLE_NAME,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {} // No special column refinements for this table

/*
 * Core database schemas
 */
export const productFeaturesInsertSchema = createInsertSchema(
  productFeatures
)
  .omit(ommittedColumnsForInsertSchema)
  .extend(columnRefinements)

export const productFeaturesSelectSchema =
  createSelectSchema(productFeatures).extend(columnRefinements)

// Update schema is kept for potential server-side use, but not exposed to client for this table type.
export const productFeaturesUpdateSchema = productFeaturesInsertSchema
  .partial()
  .extend({ id: z.string() })

/*
 * Client-facing schemas
 */

// Columns that are part of productFeaturesInsertSchema but are set by the server or not applicable for client insert.
const serverSetColumnsForInsert = {
  livemode: true, // from tableBase, server will set this based on context
  organizationId: true, // from tableBase, server will set this based on context
} as const

// Columns to hide from client when selecting/reading productFeature records.
const hiddenColumnsForSelect = {
  ...hiddenColumnsForClientSchema, // id, createdAt, updatedAt, createdByCommit, updatedByCommit, position
} as const

export const productFeatureClientInsertSchema =
  productFeaturesInsertSchema.omit(serverSetColumnsForInsert).meta({
    id: 'ProductFeatureInsert',
  })

export const productFeatureClientSelectSchema =
  productFeaturesSelectSchema.omit(hiddenColumnsForSelect).meta({
    id: 'ProductFeatureRecord',
  })

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
