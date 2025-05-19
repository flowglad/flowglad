import { z } from 'zod'
import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  createPaginatedSelectFunction,
  createDeleteFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import { DbTransaction } from '@/db/types'
import {
  productFeatures,
  productFeaturesInsertSchema,
  productFeaturesSelectSchema,
  productFeaturesUpdateSchema,
  ProductFeature,
} from '@/db/schema/productFeatures'

// Define a truly empty Zod object schema for the update part
const emptyUpdateSchema = z.object({}).strict()
type EmptyUpdateSchemaType = typeof emptyUpdateSchema

const config: ORMMethodCreatorConfig<
  typeof productFeatures,
  typeof productFeaturesSelectSchema,
  typeof productFeaturesInsertSchema,
  typeof productFeaturesUpdateSchema
> = {
  tableName: 'product_features',
  selectSchema: productFeaturesSelectSchema,
  insertSchema: productFeaturesInsertSchema,
  updateSchema: productFeaturesUpdateSchema,
}

export const selectProductFeatureById = createSelectById(
  productFeatures,
  config
)

export const insertProductFeature = createInsertFunction(
  productFeatures,
  config
)

export const updateProductFeature = createUpdateFunction(
  productFeatures,
  config
)

export const selectProductFeatures = createSelectFunction(
  productFeatures,
  config
)

export const upsertProductFeatureByProductIdAndFeatureId =
  createUpsertFunction(
    productFeatures,
    [productFeatures.productId, productFeatures.featureId],
    config
  )

export const selectProductFeaturesPaginated =
  createPaginatedSelectFunction(productFeatures, config)

export const deleteProductFeatureById =
  createDeleteFunction(productFeatures)

export type { ProductFeature }
