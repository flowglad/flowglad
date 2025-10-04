import { pgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructUniqueIndex,
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
import { organizations } from '@/db/schema/organizations'
import { buildSchemas } from '@/db/createZodSchemas'
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
      enableCustomerReadPolicy(
        `Enable read for customers (${TABLE_NAME})`,
        {
          using: sql`"product_id" in (select "id" from "products")`,
        }
      ),
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
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

export const {
  select: productFeaturesSelectSchema,
  insert: productFeaturesInsertSchema,
  update: productFeaturesUpdateSchema,
  client: {
    select: productFeatureClientSelectSchema,
    insert: productFeatureClientInsertSchema,
  },
} = buildSchemas(productFeatures, {
  entityName: 'ProductFeature',
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
