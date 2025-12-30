import { sql } from 'drizzle-orm'
import { pgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { buildSchemas } from '@/db/createZodSchemas'
import { features } from '@/db/schema/features'
import { organizations } from '@/db/schema/organizations'
import { pricingModels } from '@/db/schema/pricingModels'
import { products } from '@/db/schema/products'
import {
  constructIndex,
  constructUniqueIndex,
  createPaginatedListQuerySchema,
  createPaginatedSelectSchema,
  enableCustomerReadPolicy,
  hiddenColumnsForClientSchema,
  livemodePolicy,
  membershipOrganizationIdIntegrityCheckPolicy,
  merchantPolicy,
  notNullStringForeignKey,
  parentForeignKeyIntegrityCheckPolicy,
  type SelectConditions,
  tableBase,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'

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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  (table) => {
    return [
      constructUniqueIndex(TABLE_NAME, [
        table.productId,
        table.featureId,
      ]),
      constructIndex(TABLE_NAME, [table.productId]),
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.pricingModelId]),
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
      parentForeignKeyIntegrityCheckPolicy({
        parentTableName: 'pricing_models',
        parentIdColumnInCurrentTable: 'pricing_model_id',
        currentTableName: TABLE_NAME,
      }),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

const readOnlyColumns = {
  pricingModelId: true,
} as const

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
  insertRefine: {
    pricingModelId: z.string().optional(),
  },
  client: {
    readOnlyColumns,
  },
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
