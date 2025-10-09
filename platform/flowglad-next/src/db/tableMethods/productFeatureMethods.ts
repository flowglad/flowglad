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
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import { DbTransaction } from '@/db/types'
import {
  productFeatures,
  productFeaturesInsertSchema,
  productFeaturesSelectSchema,
  productFeaturesUpdateSchema,
  ProductFeature,
} from '@/db/schema/productFeatures'
import { and, eq, inArray, isNotNull, isNull, or, gt } from 'drizzle-orm'
import { features, featuresSelectSchema } from '../schema/features'
import { detachSubscriptionItemFeaturesFromProductFeature } from './subscriptionItemFeatureMethods'
import { Product } from '../schema/products'

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

export const expireProductFeaturesByFeatureId = async (
  productFeatureIds: string[],
  transaction: DbTransaction
) => {
  // First, detach any existing subscription item features
  const detachedSubscriptionItemFeatures =
    await detachSubscriptionItemFeaturesFromProductFeature(
      {
        productFeatureIds,
        detachedReason: 'product_feature_expired',
      },
      transaction
    )

  // Then expire the product feature
  const expiredProductFeature = await transaction
    .update(productFeatures)
    .set({ expiredAt: Date.now() })
    .where(inArray(productFeatures.id, productFeatureIds))
    .returning()

  return {
    expiredProductFeature,
    detachedSubscriptionItemFeatures,
  }
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
    .where(
      and(
        whereClauseFromObject(productFeatures, where),
        or(
          isNull(productFeatures.expiredAt),
          gt(productFeatures.expiredAt, Date.now())
        )
      )
    )
    .innerJoin(features, eq(productFeatures.featureId, features.id))
  return result.map(({ productFeature, feature }) => ({
    productFeature: productFeaturesSelectSchema.parse(productFeature),
    feature: featuresSelectSchema.parse(feature),
  }))
}

export const bulkInsertProductFeatures = createBulkInsertFunction(
  productFeatures,
  config
)

export const bulkInsertOrDoNothingProductFeatures =
  createBulkInsertOrDoNothingFunction(productFeatures, config)

export const bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId =
  async (
    inserts: ProductFeature.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingProductFeatures(
      inserts,
      [productFeatures.productId, productFeatures.featureId],
      transaction
    )
  }

export const unexpireProductFeatures = async (
  {
    featureIds,
    productId,
    organizationId,
  }: {
    featureIds: string[]
    productId: string
    organizationId: string
  },
  transaction: DbTransaction
): Promise<ProductFeature.Record[]> => {
  const unExpired = await transaction
    .update(productFeatures)
    .set({ expiredAt: null })
    .where(
      and(
        eq(productFeatures.productId, productId),
        inArray(productFeatures.featureId, featureIds),
        eq(productFeatures.organizationId, organizationId),
        isNotNull(productFeatures.expiredAt)
      )
    )
    .returning()
  return unExpired.map((pf) => productFeaturesSelectSchema.parse(pf))
}

export const syncProductFeatures = async (
  params: {
    product: Pick<
      Product.Record,
      'id' | 'livemode' | 'organizationId'
    >
    desiredFeatureIds: string[]
  },
  transaction: DbTransaction
) => {
  const { product, desiredFeatureIds } = params

  // Early return if no features to sync
  if (!desiredFeatureIds || desiredFeatureIds.length === 0) {
    // Just expire all existing features if any
    const allProductFeaturesForProduct = await selectProductFeatures(
      { productId: product.id },
      transaction
    )
    if (allProductFeaturesForProduct.length > 0) {
      const activeFeatures = allProductFeaturesForProduct.filter(
        (pf) => !pf.expiredAt
      )
      if (activeFeatures.length > 0) {
        await expireProductFeaturesByFeatureId(
          activeFeatures.map((pf) => pf.id),
          transaction
        )
      }
    }
    return []
  }

  const allProductFeaturesForProduct = await selectProductFeatures(
    {
      productId: product.id,
    },
    transaction
  )
  const existingProductFeaturesByFeatureId = new Map(
    allProductFeaturesForProduct.map((pf) => [pf.featureId, pf])
  )
  const desiredFeatureIdsSet = new Set(desiredFeatureIds)

  // Expire unwanted and active product features
  const productFeaturesToExpire = allProductFeaturesForProduct.filter(
    (pf) => !desiredFeatureIdsSet.has(pf.featureId) && !pf.expiredAt
  )

  // Only call expire if there are features to expire
  if (productFeaturesToExpire.length > 0) {
    await expireProductFeaturesByFeatureId(
      productFeaturesToExpire.map((pf) => pf.id),
      transaction
    )
  }

  const featureIdsToUnexpire = allProductFeaturesForProduct
    .filter(
      (pf) => desiredFeatureIdsSet.has(pf.featureId) && pf.expiredAt
    )
    .map((pf) => pf.featureId)

  // Only call unexpire if there are features to unexpire
  const unexpiredFeatures =
    featureIdsToUnexpire.length > 0
      ? await unexpireProductFeatures(
          {
            featureIds: featureIdsToUnexpire,
            productId: product.id,
            organizationId: product.organizationId,
          },
          transaction
        )
      : []

  const featureIdsToCreate = desiredFeatureIds.filter(
    (featureId) => !existingProductFeaturesByFeatureId.has(featureId)
  )

  // Only bulk insert if there are features to create
  const newlyCreatedFeatures =
    featureIdsToCreate.length > 0
      ? await bulkInsertProductFeatures(
          featureIdsToCreate.map((featureId) => ({
            productId: product.id,
            featureId,
            organizationId: product.organizationId,
            livemode: product.livemode,
          })),
          transaction
        )
      : []

  return [...newlyCreatedFeatures, ...unexpiredFeatures]
}
