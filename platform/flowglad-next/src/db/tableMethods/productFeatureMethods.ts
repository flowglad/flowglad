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
  whereClauseFromObject,
} from '@/db/tableUtils'
import { DbTransaction } from '@/db/types'
import {
  productFeatures,
  productFeaturesInsertSchema,
  productFeaturesSelectSchema,
  productFeaturesUpdateSchema,
  ProductFeature,
} from '@/db/schema/productFeatures'
import { eq } from 'drizzle-orm'
import { features, featuresSelectSchema } from '../schema/features'

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

/**
 * No need to "update" a product feature in our business logic,
 */
const updateProductFeature = createUpdateFunction(
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

export const expireProductFeatureById = (
  productFeatureId: string,
  transaction: DbTransaction
) => {
  return updateProductFeature(
    {
      id: productFeatureId,
      expiredAt: new Date(),
    },
    transaction
  )
}

export const createOrRestoreProductFeature = async (
  productFeature: ProductFeature.Insert,
  transaction: DbTransaction
) => {
  const [existingProductFeature] = await selectProductFeatures(
    {
      productId: productFeature.productId,
      featureId: productFeature.featureId,
    },
    transaction
  )
  if (existingProductFeature) {
    return updateProductFeature(
      {
        id: existingProductFeature.id,
        expiredAt: null,
      },
      transaction
    )
  }
  return insertProductFeature(productFeature, transaction)
}

export const selectFeaturesByProductFeatureWhere = async (
  where: ProductFeature.Where,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      productFeature: productFeatures,
      feature: features,
    })
    .from(productFeatures)
    .where(whereClauseFromObject(productFeatures, where))
    .innerJoin(features, eq(productFeatures.featureId, features.id))
  return result.map(({ productFeature, feature }) => ({
    productFeature: productFeaturesSelectSchema.parse(productFeature),
    feature: featuresSelectSchema.parse(feature),
  }))
}
