/**
 * Helper functions for updating pricing models.
 *
 * This module provides utilities for resolving database IDs from slugs
 * and batch-syncing product features during pricing model updates.
 */

import type { Feature } from '@/db/schema/features'
import type { Price } from '@/db/schema/prices'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectFeatures } from '@/db/tableMethods/featureMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import {
  batchUnexpireProductFeatures,
  bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId,
  expireProductFeaturesByFeatureId,
  selectProductFeatures,
} from '@/db/tableMethods/productFeatureMethods'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { selectResources } from '@/db/tableMethods/resourceMethods'
import { selectUsageMeters } from '@/db/tableMethods/usageMeterMethods'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'

/**
 * Maps of slugs to database IDs for all child entities of a pricing model.
 */
export type ResolvedPricingModelIds = {
  /** Feature slug -> feature ID */
  features: Map<string, string>
  /** Product slug -> product ID */
  products: Map<string, string>
  /** Price slug -> price ID */
  prices: Map<string, string>
  /** Usage meter slug -> usage meter ID */
  usageMeters: Map<string, string>
  /** Resource slug -> resource ID */
  resources: Map<string, string>
}

/**
 * Fetches all child entities of a pricing model and creates slug->id maps
 * for efficient lookup during update operations.
 *
 * @param pricingModelId - The ID of the pricing model
 * @param transaction - Database transaction
 * @returns Maps of slug->id for features, products, prices, and usage meters
 *
 * @example
 * ```typescript
 * const ids = await resolveExistingIds(pricingModelId, transaction)
 * const featureId = ids.features.get('my-feature-slug')
 * ```
 */
export const resolveExistingIds = async (
  pricingModelId: string,
  transaction: DbTransaction
): Promise<ResolvedPricingModelIds> => {
  // Fetch all child entities in parallel for better performance
  const [features, products, usageMeters, resources] =
    await Promise.all([
      selectFeatures({ pricingModelId }, transaction),
      selectProducts({ pricingModelId }, transaction),
      selectUsageMeters({ pricingModelId }, transaction),
      selectResources({ pricingModelId }, transaction),
    ])

  // Fetch prices for all products
  const productIds = products.map((p) => p.id)
  const productPrices =
    productIds.length > 0
      ? await selectPrices({ productId: productIds }, transaction)
      : []

  // Fetch prices for all usage meters
  const usageMeterIds = usageMeters.map((m) => m.id)
  const usageMeterPrices =
    usageMeterIds.length > 0
      ? await selectPrices(
          { usageMeterId: usageMeterIds },
          transaction
        )
      : []

  // Combine all prices
  const prices = [...productPrices, ...usageMeterPrices]

  // Build slug->id maps
  const featureMap = new Map<string, string>()
  for (const feature of features) {
    featureMap.set(feature.slug, feature.id)
  }

  const productMap = new Map<string, string>()
  for (const product of products) {
    if (product.slug) {
      productMap.set(product.slug, product.id)
    }
  }

  const priceMap = new Map<string, string>()
  for (const price of prices) {
    if (price.slug) {
      priceMap.set(price.slug, price.id)
    }
  }

  const usageMeterMap = new Map<string, string>()
  for (const meter of usageMeters) {
    usageMeterMap.set(meter.slug, meter.id)
  }

  const resourceMap = new Map<string, string>()
  for (const resource of resources) {
    resourceMap.set(resource.slug, resource.id)
  }

  return {
    features: featureMap,
    products: productMap,
    prices: priceMap,
    usageMeters: usageMeterMap,
    resources: resourceMap,
  }
}

/**
 * Batch-syncs product features for multiple products in a single operation.
 *
 * This function is optimized for performance by:
 * 1. Fetching all existing product_features in one query
 * 2. Computing which to expire, unexpire, and create across all products
 * 3. Expiring all unwanted features in one batch call
 * 4. Unexpiring previously expired features that are now desired again
 * 5. Creating all new features in one batch insert
 *
 * Instead of 4N database calls (fetch/expire/unexpire/insert per product),
 * this makes just 4 total database calls regardless of product count.
 *
 * @param params - Configuration object
 * @param params.productsWithFeatures - Array of products with their desired feature slugs
 * @param params.featureSlugToIdMap - Map of feature slugs to feature IDs
 * @param params.organizationId - Organization ID for new product features
 * @param params.livemode - Livemode flag for new product features
 * @param transaction - Database transaction
 * @returns Object containing arrays of added (including unexpired) and removed ProductFeature records
 *
 * @example
 * ```typescript
 * const result = await syncProductFeaturesForMultipleProducts(
 *   {
 *     productsWithFeatures: [
 *       { productId: 'prod_1', desiredFeatureSlugs: ['feature-a', 'feature-b'] },
 *       { productId: 'prod_2', desiredFeatureSlugs: ['feature-c'] },
 *     ],
 *     featureSlugToIdMap: new Map([
 *       ['feature-a', 'feat_1'],
 *       ['feature-b', 'feat_2'],
 *       ['feature-c', 'feat_3'],
 *     ]),
 *     organizationId: 'org_123',
 *     livemode: false,
 *   },
 *   transaction
 * )
 * ```
 */
export const syncProductFeaturesForMultipleProducts = async (
  {
    productsWithFeatures,
    featureSlugToIdMap,
    organizationId,
    livemode,
  }: {
    productsWithFeatures: Array<{
      productId: string
      desiredFeatureSlugs: string[]
    }>
    featureSlugToIdMap: Map<string, string>
    organizationId: string
    livemode: boolean
  },
  transactionParams: Pick<
    TransactionEffectsContext,
    'transaction' | 'invalidateCache'
  >
): Promise<{
  added: ProductFeature.Record[]
  removed: ProductFeature.Record[]
}> => {
  const { transaction, invalidateCache } = transactionParams
  // Early return if no products to sync
  if (productsWithFeatures.length === 0) {
    return { added: [], removed: [] }
  }

  // Step 1: Fetch all existing product_features for all affected products in one query
  const allProductIds = productsWithFeatures.map((p) => p.productId)
  const existingProductFeatures = await selectProductFeatures(
    { productId: allProductIds },
    transaction
  )

  // Build a map of productId -> existing productFeatures for efficient lookup
  const existingByProductId = new Map<
    string,
    ProductFeature.Record[]
  >()
  for (const pf of existingProductFeatures) {
    const existing = existingByProductId.get(pf.productId) || []
    existing.push(pf)
    existingByProductId.set(pf.productId, existing)
  }

  // Step 2: Compute what needs to be expired, unexpired, and created
  const productFeatureIdsToExpire: string[] = []
  const productFeatureIdsToUnexpire: string[] = []
  const productFeatureInserts: ProductFeature.Insert[] = []

  for (const {
    productId,
    desiredFeatureSlugs,
  } of productsWithFeatures) {
    // Convert desired slugs to feature IDs
    const desiredFeatureIds = new Set<string>()
    for (const slug of desiredFeatureSlugs) {
      const featureId = featureSlugToIdMap.get(slug)
      if (featureId) {
        desiredFeatureIds.add(featureId)
      }
    }

    // Get existing product features for this product
    const existingForProduct =
      existingByProductId.get(productId) || []

    // Build a map of featureId -> productFeature for this product
    const existingByFeatureId = new Map<
      string,
      ProductFeature.Record
    >()
    for (const pf of existingForProduct) {
      existingByFeatureId.set(pf.featureId, pf)
    }

    // Find features to expire (exist, not desired, and not already expired)
    for (const pf of existingForProduct) {
      if (!desiredFeatureIds.has(pf.featureId) && !pf.expiredAt) {
        productFeatureIdsToExpire.push(pf.id)
      }
    }

    // Find features to create or unexpire
    for (const featureId of desiredFeatureIds) {
      const existingPf = existingByFeatureId.get(featureId)
      if (!existingPf) {
        // Feature doesn't exist at all - create new
        productFeatureInserts.push({
          productId,
          featureId,
          organizationId,
          livemode,
        })
      } else if (existingPf.expiredAt) {
        // Feature exists but is expired - unexpire it
        productFeatureIdsToUnexpire.push(existingPf.id)
      }
      // else: feature exists and is active - no action needed
    }
  }

  // Step 3: Batch expire unwanted product features
  // Note: expireProductFeaturesByFeatureId calls invalidateCache directly
  let expiredProductFeatures: ProductFeature.Record[] = []
  if (productFeatureIdsToExpire.length > 0) {
    const expireResult = await expireProductFeaturesByFeatureId(
      productFeatureIdsToExpire,
      { transaction, invalidateCache }
    )
    expiredProductFeatures = expireResult.expiredProductFeature
  }

  // Step 4: Batch unexpire previously expired product features
  let unexpiredProductFeatures: ProductFeature.Record[] = []
  if (productFeatureIdsToUnexpire.length > 0) {
    unexpiredProductFeatures = await batchUnexpireProductFeatures(
      productFeatureIdsToUnexpire,
      { transaction, invalidateCache }
    )
  }

  // Step 5: Batch insert new product features
  let createdProductFeatures: ProductFeature.Record[] = []
  if (productFeatureInserts.length > 0) {
    createdProductFeatures =
      await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
        productFeatureInserts,
        transaction
      )
  }

  return {
    // Include both newly created and unexpired features in 'added'
    added: [...createdProductFeatures, ...unexpiredProductFeatures],
    removed: expiredProductFeatures,
  }
}
