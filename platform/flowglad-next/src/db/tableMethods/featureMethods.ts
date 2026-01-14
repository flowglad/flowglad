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
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
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

export const insertFeature = createInsertFunction(features, config)

export const updateFeature = createUpdateFunction(features, config)

export const selectFeatures = createSelectFunction(features, config)

export const upsertFeatureByPricingModelIdAndSlug =
  createUpsertFunction(
    features,
    [features.pricingModelId, features.slug],
    config
  )

export const bulkInsertOrDoNothingFeatures =
  createBulkInsertOrDoNothingFunction(features, config)

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

export const bulkInsertFeatures = createBulkInsertFunction(
  features,
  config
)

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
    AuthenticatedTransactionParams,
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
