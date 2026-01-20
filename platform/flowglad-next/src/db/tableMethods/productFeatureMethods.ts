import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import {
  type ProductFeature,
  productFeatureClientSelectSchema,
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
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
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

export const selectProductFeatures = createSelectFunction(
  productFeatures,
  config
)

/**
 * Select product features by pricing model ID with caching.
 * Cached by default; pass { ignoreCache: true } to bypass.
 */
export const selectProductFeaturesByPricingModelId = cached(
  {
    namespace: RedisKeyNamespace.ProductFeaturesByPricingModel,
    keyFn: (pricingModelId: string, _transaction: DbTransaction) =>
      pricingModelId,
    schema: productFeatureClientSelectSchema.array(),
    dependenciesFn: (_productFeatures, pricingModelId: string) => [
      CacheDependency.productFeaturesByPricingModel(pricingModelId),
    ],
  },
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<ProductFeature.ClientRecord[]> => {
    const result = await selectProductFeatures(
      { pricingModelId },
      transaction
    )
    return result.map((pf) =>
      productFeatureClientSelectSchema.parse(pf)
    )
  }
)

const baseInsertProductFeature = createInsertFunction(
  productFeatures,
  config
)

export const insertProductFeature = async (
  productFeatureInsert: ProductFeature.Insert,
  ctx: TransactionEffectsContext
): Promise<ProductFeature.Record> => {
  const pricingModelId = productFeatureInsert.pricingModelId
    ? productFeatureInsert.pricingModelId
    : await derivePricingModelIdFromProduct(
        productFeatureInsert.productId,
        ctx.transaction
      )
  const result = await baseInsertProductFeature(
    {
      ...productFeatureInsert,
      pricingModelId,
    },
    ctx.transaction
  )
  // Invalidate product features cache for the pricing model (queued for after commit)
  ctx.invalidateCache(
    CacheDependency.productFeaturesByPricingModel(
      result.pricingModelId
    )
  )
  return result
}

const baseUpdateProductFeature = createUpdateFunction(
  productFeatures,
  config
)

/**
 * Update a product feature and invalidate caches.
 */
export const updateProductFeature = async (
  productFeature: z.infer<typeof productFeaturesUpdateSchema>,
  ctx: TransactionEffectsContext
): Promise<ProductFeature.Record> => {
  const result = await baseUpdateProductFeature(
    productFeature,
    ctx.transaction
  )
  // Invalidate product features cache for the pricing model (queued for after commit)
  ctx.invalidateCache(
    CacheDependency.productFeaturesByPricingModel(
      result.pricingModelId
    )
  )
  return result
}

const baseUpsertProductFeatureByProductIdAndFeatureId =
  createUpsertFunction(
    productFeatures,
    [productFeatures.productId, productFeatures.featureId],
    config
  )

export const upsertProductFeatureByProductIdAndFeatureId = async (
  productFeature: ProductFeature.Insert,
  ctx: TransactionEffectsContext
): Promise<ProductFeature.Record[]> => {
  const results =
    await baseUpsertProductFeatureByProductIdAndFeatureId(
      productFeature,
      ctx.transaction
    )
  // Invalidate product features cache for all affected pricing models (queued for after commit)
  const pricingModelIds = [
    ...new Set(results.map((pf) => pf.pricingModelId)),
  ]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.productFeaturesByPricingModel(pricingModelId)
    )
  }
  return results
}

export const selectProductFeaturesPaginated =
  createPaginatedSelectFunction(productFeatures, config)

export const expireProductFeaturesByFeatureId = async (
  productFeatureIds: string[],
  ctx: Pick<
    TransactionEffectsContext,
    'transaction' | 'invalidateCache'
  >
): Promise<{
  expiredProductFeature: ProductFeature.Record[]
  detachedSubscriptionItemFeatures: import('@/db/schema/subscriptionItemFeatures').SubscriptionItemFeature.Record[]
}> => {
  // First, detach any existing subscription item features
  const detachedSubscriptionItemFeatures =
    await detachSubscriptionItemFeaturesFromProductFeature(
      {
        productFeatureIds,
        detachedReason: 'product_feature_expired',
      },
      ctx.transaction
    )

  // Then expire the product feature
  const expiredProductFeature = await ctx.transaction
    .update(productFeatures)
    .set({ expiredAt: Date.now() })
    .where(inArray(productFeatures.id, productFeatureIds))
    .returning()

  // Invalidate cache for affected subscription items
  const subscriptionItemIds = [
    ...new Set(
      detachedSubscriptionItemFeatures.map(
        (feature) => feature.subscriptionItemId
      )
    ),
  ]
  ctx.invalidateCache(
    ...subscriptionItemIds.map((id) =>
      CacheDependency.subscriptionItemFeatures(id)
    )
  )

  const parsedExpiredProductFeatures = productFeaturesSelectSchema
    .array()
    .parse(expiredProductFeature)

  // Invalidate product features cache for all affected pricing models (queued for after commit)
  const pricingModelIds = [
    ...new Set(
      parsedExpiredProductFeatures.map((pf) => pf.pricingModelId)
    ),
  ]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.productFeaturesByPricingModel(pricingModelId)
    )
  }

  return {
    expiredProductFeature: parsedExpiredProductFeatures,
    detachedSubscriptionItemFeatures,
  }
}

export const createOrRestoreProductFeature = async (
  productFeature: ProductFeature.Insert,
  ctx: TransactionEffectsContext
) => {
  const [existingProductFeature] = await selectProductFeatures(
    {
      productId: productFeature.productId,
      featureId: productFeature.featureId,
    },
    ctx.transaction
  )
  if (existingProductFeature) {
    return updateProductFeature(
      {
        id: existingProductFeature.id,
        expiredAt: null,
      },
      ctx
    )
  }
  return insertProductFeature(productFeature, ctx)
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
  ctx: TransactionEffectsContext
): Promise<ProductFeature.Record[]> => {
  const pricingModelIdMap = await pricingModelIdsForProducts(
    productFeatureInserts.map((insert) => insert.productId),
    ctx.transaction
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
  const results = await baseBulkInsertProductFeatures(
    productFeaturesWithPricingModelId,
    ctx.transaction
  )

  // Invalidate product features cache for all affected pricing models (queued for after commit)
  const pricingModelIds = [
    ...new Set(results.map((pf) => pf.pricingModelId)),
  ]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.productFeaturesByPricingModel(pricingModelId)
    )
  }

  return results
}

const baseBulkInsertOrDoNothingProductFeatures =
  createBulkInsertOrDoNothingFunction(productFeatures, config)

export const bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId =
  async (
    inserts: ProductFeature.Insert[],
    ctx: TransactionEffectsContext
  ) => {
    const pricingModelIdMap = await pricingModelIdsForProducts(
      inserts.map((insert) => insert.productId),
      ctx.transaction
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
    const results = await baseBulkInsertOrDoNothingProductFeatures(
      productFeaturesWithPricingModelId,
      [productFeatures.productId, productFeatures.featureId],
      ctx.transaction
    )

    // Invalidate product features cache for all affected pricing models (queued for after commit)
    // Use the input inserts to get pricingModelIds since they're computed above
    // Filter out undefined values (should not happen due to throw above, but TypeScript needs this)
    const pricingModelIds = [
      ...new Set(
        productFeaturesWithPricingModelId
          .map((pf) => pf.pricingModelId)
          .filter((id): id is string => id !== undefined)
      ),
    ]
    for (const pricingModelId of pricingModelIds) {
      ctx.invalidateCache(
        CacheDependency.productFeaturesByPricingModel(pricingModelId)
      )
    }

    return results
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
  ctx: TransactionEffectsContext
): Promise<ProductFeature.Record[]> => {
  const unExpired = await ctx.transaction
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

  const parsedUnexpired = unExpired.map((pf) =>
    productFeaturesSelectSchema.parse(pf)
  )

  // Invalidate product features cache for all affected pricing models (queued for after commit)
  const pricingModelIds = [
    ...new Set(
      parsedUnexpired.map((pf) => pf.pricingModelId).filter(Boolean)
    ),
  ] as string[]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.productFeaturesByPricingModel(pricingModelId)
    )
  }

  return parsedUnexpired
}

/**
 * Batch unexpire product features by their IDs.
 * This is more efficient for bulk operations across multiple products.
 *
 * @param productFeatureIds - Array of product feature IDs to unexpire
 * @param ctx - TransactionEffectsContext for transaction and cache invalidation
 * @returns Array of unexpired ProductFeature records
 */
export const batchUnexpireProductFeatures = async (
  productFeatureIds: string[],
  ctx: Pick<
    TransactionEffectsContext,
    'transaction' | 'invalidateCache'
  >
): Promise<ProductFeature.Record[]> => {
  if (productFeatureIds.length === 0) {
    return []
  }
  const unexpired = await ctx.transaction
    .update(productFeatures)
    .set({ expiredAt: null })
    .where(
      and(
        inArray(productFeatures.id, productFeatureIds),
        isNotNull(productFeatures.expiredAt)
      )
    )
    .returning()

  const parsedUnexpired = unexpired.map((pf) =>
    productFeaturesSelectSchema.parse(pf)
  )

  // Invalidate subscription item feature caches for subscription items
  // that use products associated with the unexpired product features.
  // This ensures cache consistency when product features become active again.
  // Subscription items are linked to products through prices (subscription_items.priceId -> prices.productId).
  if (parsedUnexpired.length > 0) {
    const productIds = [
      ...new Set(parsedUnexpired.map((pf) => pf.productId)),
    ]
    const { selectPrices } = await import('./priceMethods')
    const { selectSubscriptionItems } = await import(
      './subscriptionItemMethods'
    )
    // Find prices for the affected products
    const affectedPrices = await selectPrices(
      { productId: productIds },
      ctx.transaction
    )
    if (affectedPrices.length > 0) {
      const priceIds = affectedPrices.map((p) => p.id)
      // Find subscription items that use those prices
      const affectedSubscriptionItems = await selectSubscriptionItems(
        { priceId: priceIds },
        ctx.transaction
      )
      const subscriptionItemIds = affectedSubscriptionItems.map(
        (si) => si.id
      )
      ctx.invalidateCache(
        ...subscriptionItemIds.map((id) =>
          CacheDependency.subscriptionItemFeatures(id)
        )
      )
    }

    // Invalidate product features cache for all affected pricing models (queued for after commit)
    const pricingModelIds = [
      ...new Set(
        parsedUnexpired.map((pf) => pf.pricingModelId).filter(Boolean)
      ),
    ] as string[]
    for (const pricingModelId of pricingModelIds) {
      ctx.invalidateCache(
        CacheDependency.productFeaturesByPricingModel(pricingModelId)
      )
    }
  }

  return parsedUnexpired
}

export const syncProductFeatures = async (
  params: {
    product: Pick<
      Product.Record,
      'id' | 'livemode' | 'organizationId'
    >
    desiredFeatureIds: string[]
  },
  ctx: Pick<
    TransactionEffectsContext,
    'transaction' | 'invalidateCache'
  >
) => {
  const { product, desiredFeatureIds } = params

  // Early return if no features to sync
  if (!desiredFeatureIds || desiredFeatureIds.length === 0) {
    // Just expire all existing features if any
    const allProductFeaturesForProduct = await selectProductFeatures(
      { productId: product.id },
      ctx.transaction
    )
    if (allProductFeaturesForProduct.length > 0) {
      const activeFeatures = allProductFeaturesForProduct.filter(
        (pf) => !pf.expiredAt
      )
      if (activeFeatures.length > 0) {
        await expireProductFeaturesByFeatureId(
          activeFeatures.map((pf) => pf.id),
          ctx
        )
      }
    }
    return []
  }

  const allProductFeaturesForProduct = await selectProductFeatures(
    {
      productId: product.id,
    },
    ctx.transaction
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
      ctx
    )
  }

  const productFeatureIdsToUnexpire = allProductFeaturesForProduct
    .filter(
      (pf) => desiredFeatureIdsSet.has(pf.featureId) && pf.expiredAt
    )
    .map((pf) => pf.id)

  // Only call unexpire if there are features to unexpire
  const unexpiredFeatures =
    productFeatureIdsToUnexpire.length > 0
      ? await batchUnexpireProductFeatures(
          productFeatureIdsToUnexpire,
          ctx
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
          ctx as TransactionEffectsContext
        )
      : []

  return [...newlyCreatedFeatures, ...unexpiredFeatures]
}
