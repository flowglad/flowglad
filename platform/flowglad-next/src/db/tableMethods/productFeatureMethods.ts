import { z } from 'zod'
import {
  createSelectById,
  createInsertFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  productFeatures,
  productFeaturesInsertSchema,
  productFeaturesSelectSchema,
  ProductFeature,
} from '@/db/schema/productFeatures'

// Define a truly empty Zod object schema for the update part
const emptyUpdateSchema = z.object({}).strict()
type EmptyUpdateSchemaType = typeof emptyUpdateSchema

const config: ORMMethodCreatorConfig<
  typeof productFeatures,
  typeof productFeaturesSelectSchema,
  typeof productFeaturesInsertSchema,
  EmptyUpdateSchemaType // Use the type of our empty schema
> = {
  tableName: productFeatures._.name,
  selectSchema: productFeaturesSelectSchema,
  insertSchema: productFeaturesInsertSchema,
  updateSchema: emptyUpdateSchema, // Use the empty schema instance
}

export const selectProductFeatureById = createSelectById(
  productFeatures,
  config
)

export const insertProductFeature = createInsertFunction(
  productFeatures,
  config
)

// No generic update function for this association table
// export const updateProductFeature = createUpdateFunction(productFeatures, config);

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
