import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  type Feature,
  features,
  featuresClientSelectSchema,
  featuresInsertSchema,
  featuresSelectSchema,
  featuresUpdateSchema,
} from '@/db/schema/features'
import {
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import {
  CacheDependency,
  cached,
  invalidateDependencies,
} from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import type { PricingModel } from '../schema/pricingModels'
import { selectPricingModels } from './pricingModelMethods'
import {
  expireProductFeaturesByFeatureId,
  selectProductFeatures,
  updateProductFeature,
} from './productFeatureMethods'

const config: ORMMethodCreatorConfig<
  typeof features,
  typeof featuresSelectSchema,
  typeof featuresInsertSchema,
  typeof featuresUpdateSchema
> = {
  selectSchema: featuresSelectSchema,
  insertSchema: featuresInsertSchema,
  updateSchema: featuresUpdateSchema,
  tableName: 'features',
}

export const selectFeatureById = createSelectById(features, config)

export const selectFeatures = createSelectFunction(features, config)

/**
 * Select features by pricing model ID with caching.
 * Cached by default; pass { ignoreCache: true } to bypass.
 */
export const selectFeaturesByPricingModelId = cached(
  {
    namespace: RedisKeyNamespace.FeaturesByPricingModel,
    keyFn: (pricingModelId: string, _transaction: DbTransaction) =>
      pricingModelId,
    schema: featuresClientSelectSchema.array(),
    dependenciesFn: (_features, pricingModelId: string) => [
      CacheDependency.featuresByPricingModel(pricingModelId),
    ],
  },
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<Feature.ClientRecord[]> => {
    const result = await selectFeatures(
      { pricingModelId },
      transaction
    )
    return result.map((feature) =>
      featuresClientSelectSchema.parse(feature)
    )
  }
)

/**
 * Invalidate features cache for a pricing model.
 */
export const invalidateFeaturesByPricingModelCache = async (
  pricingModelId: string
): Promise<void> => {
  await invalidateDependencies([
    CacheDependency.featuresByPricingModel(pricingModelId),
  ])
}

const baseInsertFeature = createInsertFunction(features, config)

export const insertFeature = async (
  feature: Feature.Insert,
  transaction: DbTransaction
): Promise<Feature.Record> => {
  const result = await baseInsertFeature(feature, transaction)
  // Invalidate features cache for the pricing model
  await invalidateFeaturesByPricingModelCache(result.pricingModelId)
  return result
}

const baseUpdateFeature = createUpdateFunction(features, config)

export const updateFeature = async (
  feature: Feature.Update,
  transaction: DbTransaction
): Promise<Feature.Record> => {
  const result = await baseUpdateFeature(feature, transaction)
  // Invalidate features cache for the pricing model
  await invalidateFeaturesByPricingModelCache(result.pricingModelId)
  return result
}

const baseUpsertFeatureByPricingModelIdAndSlug = createUpsertFunction(
  features,
  [features.pricingModelId, features.slug],
  config
)

export const upsertFeatureByPricingModelIdAndSlug = async (
  feature: Feature.Insert,
  transaction: DbTransaction
): Promise<Feature.Record> => {
  const result = await baseUpsertFeatureByPricingModelIdAndSlug(
    feature,
    transaction
  )
  // Invalidate features cache for the pricing model
  // Use input pricingModelId since it's guaranteed and avoids discriminated union issues
  await invalidateFeaturesByPricingModelCache(feature.pricingModelId)
  // Parse through schema to ensure correct discriminated union type
  return featuresSelectSchema.parse(result)
}

const baseBulkInsertOrDoNothingFeatures =
  createBulkInsertOrDoNothingFunction(features, config)

export const bulkInsertOrDoNothingFeatures = async (
  inserts: Feature.Insert[],
  conflictTarget: Parameters<
    typeof baseBulkInsertOrDoNothingFeatures
  >[1],
  transaction: DbTransaction
) => {
  const results = await baseBulkInsertOrDoNothingFeatures(
    inserts,
    conflictTarget,
    transaction
  )

  // Invalidate features cache for all affected pricing models
  // Use inserts to get pricingModelIds since all variants have this field
  const pricingModelIds = [
    ...new Set(inserts.map((f) => f.pricingModelId)),
  ]
  if (pricingModelIds.length > 0) {
    await Promise.all(
      pricingModelIds.map(invalidateFeaturesByPricingModelCache)
    )
  }

  return results
}

export const bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug =
  async (inserts: Feature.Insert[], transaction: DbTransaction) => {
    return bulkInsertOrDoNothingFeatures(
      inserts,
      [
        features.pricingModelId,
        features.slug,
        features.organizationId,
      ],
      transaction
    )
  }

const baseBulkInsertFeatures = createBulkInsertFunction(
  features,
  config
)

export const bulkInsertFeatures = async (
  inserts: Feature.Insert[],
  transaction: DbTransaction
) => {
  if (inserts.length === 0) {
    return []
  }
  const results = await baseBulkInsertFeatures(inserts, transaction)

  // Invalidate features cache for all affected pricing models
  // Use inserts to get pricingModelIds since all variants have this field
  const pricingModelIds = [
    ...new Set(inserts.map((f) => f.pricingModelId)),
  ]
  await Promise.all(
    pricingModelIds.map(invalidateFeaturesByPricingModelCache)
  )

  return results
}

export const selectFeaturesPaginated = createPaginatedSelectFunction(
  features,
  config
)

export const featuresTableRowOutputSchema = z.object({
  feature: featuresClientSelectSchema,
  pricingModel: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const selectFeaturesTableRowData =
  createCursorPaginatedSelectFunction(
    features,
    config,
    featuresTableRowOutputSchema,
    async (
      featuresData: Feature.Record[],
      transaction: DbTransaction
    ) => {
      const pricingModelIds = featuresData.map(
        (feature) => feature.pricingModelId
      )
      const pricingModels = await selectPricingModels(
        { id: pricingModelIds },
        transaction
      )
      const pricingModelsById = new Map(
        pricingModels.map((pricingModel: PricingModel.Record) => [
          pricingModel.id,
          pricingModel,
        ])
      )
      return featuresData.map((feature) => ({
        feature,
        pricingModel: {
          id: pricingModelsById.get(feature.pricingModelId)!.id,
          name: pricingModelsById.get(feature.pricingModelId)!.name,
        },
      }))
    },
    // Searchable columns for ILIKE search on name and slug
    [features.name, features.slug],
    /**
     * Additional search clause for exact ID match.
     * Combined with base name/slug search via OR.
     */
    ({ searchQuery }) => {
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      if (!trimmedQuery) return undefined

      return eq(features.id, trimmedQuery)
    }
  )

/**
 * Updates a feature and syncs its active state with related product features.
 *
 * When active changes to false:
 * - Expires all productFeatures (prevents new subscriptions from getting the feature)
 * - Detaches existing subscriptionItemFeatures from productFeatures (preserves customer access)
 *
 * When active changes to true:
 * - Unexpires all productFeatures (allows new subscriptions to get the feature)
 *
 * Note: Existing customer subscriptionItemFeatures are never expired - customers
 * retain access to features they already have, even if the feature is deactivated.
 */
export const updateFeatureTransaction = async (
  featureUpdate: Feature.Update,
  params: Pick<
    TransactionEffectsContext,
    'transaction' | 'invalidateCache'
  >
): Promise<Feature.Record> => {
  const { transaction, invalidateCache } = params
  // Step 1: Get the current feature state to detect changes
  const oldFeature = await selectFeatureById(
    featureUpdate.id,
    transaction
  )

  // Step 2: Update the feature
  const updatedFeature = await updateFeature(
    featureUpdate,
    transaction
  )

  // Step 3: Check if 'active' field changed
  const activeChanged =
    'active' in featureUpdate &&
    featureUpdate.active !== oldFeature.active

  if (activeChanged) {
    const featureId = updatedFeature.id

    // Get all productFeatures for this feature
    const productFeaturesForFeature = await selectProductFeatures(
      { featureId },
      transaction
    )

    if (productFeaturesForFeature.length > 0) {
      const productFeatureIds = productFeaturesForFeature.map(
        (pf) => pf.id
      )

      if (featureUpdate.active === false) {
        // Feature deactivated - expire product features
        // This prevents NEW subscriptions from getting the feature
        // Note: expireProductFeaturesByFeatureId also detaches existing subscriptionItemFeatures
        // and calls invalidateCache directly
        await expireProductFeaturesByFeatureId(productFeatureIds, {
          transaction,
          invalidateCache,
        })
      } else if (featureUpdate.active === true) {
        // Feature reactivated - unexpire product features
        // This allows NEW subscriptions to get the feature again
        const expiredProductFeatures =
          productFeaturesForFeature.filter(
            (pf) => pf.expiredAt !== null
          )

        if (expiredProductFeatures.length > 0) {
          // Unexpire by setting expiredAt to null
          await Promise.all(
            expiredProductFeatures.map((pf) =>
              updateProductFeature(
                { id: pf.id, expiredAt: null },
                transaction
              )
            )
          )
        }
      }
    }
  }

  return updatedFeature
}
