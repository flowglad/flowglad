import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import {
  type ProductFeature,
  productFeatures,
  productFeaturesInsertSchema,
  productFeaturesSelectSchema,
  productFeaturesUpdateSchema,
} from '@/db/schema/productFeatures'
import {
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type {
  AuthenticatedTransactionParams,
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { features, featuresSelectSchema } from '../schema/features'
import type { Product } from '../schema/products'
import { createDateNotPassedFilter } from '../tableUtils'
import {
  derivePricingModelIdFromProduct,
  pricingModelIdsForProducts,
} from './productMethods'
import { detachSubscriptionItemFeaturesFromProductFeature } from './subscriptionItemFeatureMethods'

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

const baseInsertProductFeature = createInsertFunction(
  productFeatures,
  config
)

export const insertProductFeature = async (
  productFeatureInsert: ProductFeature.Insert,
  transaction: DbTransaction
): Promise<ProductFeature.Record> => {
  const pricingModelId = productFeatureInsert.pricingModelId
    ? productFeatureInsert.pricingModelId
    : await derivePricingModelIdFromProduct(
        productFeatureInsert.productId,
        transaction
      )
  return baseInsertProductFeature(
    {
      ...productFeatureInsert,
      pricingModelId,
    },
    transaction
  )
}

/**
 * No need to "update" a product feature in our business logic,
 */
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

export const expireProductFeaturesByFeatureId = async (
  productFeatureIds: string[],
  params: Pick<TransactionEffectsContext, 'transaction'>
): Promise<{
  expiredProductFeature: ProductFeature.Record[]
  detachedSubscriptionItemFeatures: import('@/db/schema/subscriptionItemFeatures').SubscriptionItemFeature.Record[]
}> => {
  const { transaction } = params

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
    expiredProductFeature: productFeaturesSelectSchema
      .array()
      .parse(expiredProductFeature),
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
        createDateNotPassedFilter(productFeatures.expiredAt)
      )
    )
    .innerJoin(features, eq(productFeatures.featureId, features.id))
  return result.map(({ productFeature, feature }) => ({
    productFeature: productFeaturesSelectSchema.parse(productFeature),
    feature: featuresSelectSchema.parse(feature),
  }))
}

const baseBulkInsertProductFeatures = createBulkInsertFunction(
  productFeatures,
  config
)

export const bulkInsertProductFeatures = async (
  productFeatureInserts: ProductFeature.Insert[],
  transaction: DbTransaction
): Promise<ProductFeature.Record[]> => {
  const pricingModelIdMap = await pricingModelIdsForProducts(
    productFeatureInserts.map((insert) => insert.productId),
    transaction
  )
  const productFeaturesWithPricingModelId = productFeatureInserts.map(
    (productFeatureInsert): ProductFeature.Insert => {
      const pricingModelId =
        productFeatureInsert.pricingModelId ??
        pricingModelIdMap.get(productFeatureInsert.productId)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for product ${productFeatureInsert.productId}`
        )
      }
      return {
        ...productFeatureInsert,
        pricingModelId,
      }
    }
  )
  return baseBulkInsertProductFeatures(
    productFeaturesWithPricingModelId,
    transaction
  )
}

const baseBulkInsertOrDoNothingProductFeatures =
  createBulkInsertOrDoNothingFunction(productFeatures, config)

export const bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId =
  async (
    inserts: ProductFeature.Insert[],
    transaction: DbTransaction
  ) => {
    const pricingModelIdMap = await pricingModelIdsForProducts(
      inserts.map((insert) => insert.productId),
      transaction
    )
    const productFeaturesWithPricingModelId = inserts.map(
      (productFeatureInsert): ProductFeature.Insert => {
        const pricingModelId =
          productFeatureInsert.pricingModelId ??
          pricingModelIdMap.get(productFeatureInsert.productId)
        if (!pricingModelId) {
          throw new Error(
            `Pricing model id not found for product ${productFeatureInsert.productId}`
          )
        }
        return {
          ...productFeatureInsert,
          pricingModelId,
        }
      }
    )
    return baseBulkInsertOrDoNothingProductFeatures(
      productFeaturesWithPricingModelId,
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

/**
 * Batch unexpire product features by their IDs.
 * This is more efficient for bulk operations across multiple products.
 *
 * @param productFeatureIds - Array of product feature IDs to unexpire
 * @param transaction - Database transaction
 * @returns Array of unexpired ProductFeature records
 */
export const batchUnexpireProductFeatures = async (
  productFeatureIds: string[],
  transaction: DbTransaction
): Promise<ProductFeature.Record[]> => {
  if (productFeatureIds.length === 0) {
    return []
  }
  const unexpired = await transaction
    .update(productFeatures)
    .set({ expiredAt: null })
    .where(
      and(
        inArray(productFeatures.id, productFeatureIds),
        isNotNull(productFeatures.expiredAt)
      )
    )
    .returning()
  return unexpired.map((pf) => productFeaturesSelectSchema.parse(pf))
}

export const syncProductFeatures = async (
  params: {
    product: Pick<
      Product.Record,
      'id' | 'livemode' | 'organizationId'
    >
    desiredFeatureIds: string[]
  },
  transactionParams: Pick<TransactionEffectsContext, 'transaction'>
) => {
  const { product, desiredFeatureIds } = params
  const { transaction } = transactionParams

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
          { transaction }
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
      { transaction }
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
