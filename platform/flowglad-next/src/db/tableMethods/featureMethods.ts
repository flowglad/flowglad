import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  createCursorPaginatedSelectFunction,
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
import { selectCatalogs } from './catalogMethods'
import { Catalog } from '../schema/catalogs'
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

export const featuresTableRowOutputSchema = z.object({
  feature: featuresClientSelectSchema,
  catalog: z.object({
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
      const catalogIds = features.map((feature) => feature.catalogId)
      const catalogs = await selectCatalogs(
        { id: catalogIds },
        transaction
      )
      const catalogsById = new Map(
        catalogs.map((catalog: Catalog.Record) => [
          catalog.id,
          catalog,
        ])
      )
      return features.map((feature) => ({
        feature,
        catalog: {
          id: catalogsById.get(feature.catalogId)!.id,
          name: catalogsById.get(feature.catalogId)!.name,
        },
      }))
    }
  )
