import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  createCursorPaginatedSelectFunction,
  createBulkInsertOrDoNothingFunction,
  createBulkInsertFunction,
} from '@/db/tableUtils'
import {
  features,
  featuresInsertSchema,
  featuresSelectSchema,
  featuresUpdateSchema,
  featuresClientSelectSchema,
  Feature,
} from '@/db/schema/features'
import { z } from 'zod'
import { selectPricingModels } from './pricingModelMethods'
import { PricingModel } from '../schema/pricingModels'
import { DbTransaction } from '@/db/types'

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
      features: Feature.Record[],
      transaction: DbTransaction
    ) => {
      const pricingModelIds = features.map(
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
      return features.map((feature) => ({
        feature,
        pricingModel: {
          id: pricingModelsById.get(feature.pricingModelId)!.id,
          name: pricingModelsById.get(feature.pricingModelId)!.name,
        },
      }))
    },
    // Searchable columns for features table
    [features.name, features.description, features.slug]
  )
