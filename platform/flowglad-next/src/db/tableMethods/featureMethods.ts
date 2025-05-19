import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  features,
  featuresInsertSchema,
  featuresSelectSchema,
  featuresUpdateSchema,
  featuresClientSelectSchema,
} from '@/db/schema/features'

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

export const upsertFeatureByOrganizationIdAndSlug =
  createUpsertFunction(
    features,
    [features.organizationId, features.slug],
    config
  )

export const selectFeaturesPaginated = createPaginatedSelectFunction(
  features,
  config
)
