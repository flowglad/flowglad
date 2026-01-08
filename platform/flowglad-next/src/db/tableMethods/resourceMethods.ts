import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  type Resource,
  resources,
  resourcesClientSelectSchema,
  resourcesInsertSchema,
  resourcesSelectSchema,
  resourcesUpdateSchema,
} from '@/db/schema/resources'
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
import type { DbTransaction } from '@/db/types'
import type { PricingModel } from '../schema/pricingModels'
import { selectPricingModels } from './pricingModelMethods'

const config: ORMMethodCreatorConfig<
  typeof resources,
  typeof resourcesSelectSchema,
  typeof resourcesInsertSchema,
  typeof resourcesUpdateSchema
> = {
  selectSchema: resourcesSelectSchema,
  insertSchema: resourcesInsertSchema,
  updateSchema: resourcesUpdateSchema,
  tableName: 'resources',
}

export const selectResourceById = createSelectById(resources, config)

export const insertResource = createInsertFunction(resources, config)

export const updateResource = createUpdateFunction(resources, config)

export const selectResources = createSelectFunction(resources, config)

export const upsertResourceByPricingModelIdAndSlug =
  createUpsertFunction(
    resources,
    [resources.pricingModelId, resources.slug],
    config
  )

export const bulkInsertOrDoNothingResources =
  createBulkInsertOrDoNothingFunction(resources, config)

export const bulkInsertOrDoNothingResourcesByPricingModelIdAndSlug =
  async (inserts: Resource.Insert[], transaction: DbTransaction) => {
    return bulkInsertOrDoNothingResources(
      inserts,
      [
        resources.pricingModelId,
        resources.slug,
        resources.organizationId,
      ],
      transaction
    )
  }

export const bulkInsertResources = createBulkInsertFunction(
  resources,
  config
)

export const selectResourcesPaginated = createPaginatedSelectFunction(
  resources,
  config
)

export const resourcesTableRowOutputSchema = z.object({
  resource: resourcesClientSelectSchema,
  pricingModel: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const selectResourcesTableRowData =
  createCursorPaginatedSelectFunction(
    resources,
    config,
    resourcesTableRowOutputSchema,
    async (
      resourcesData: Resource.Record[],
      transaction: DbTransaction
    ) => {
      const pricingModelIds = resourcesData.map(
        (resource) => resource.pricingModelId
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
      return resourcesData.map((resource) => ({
        resource,
        pricingModel: {
          id: pricingModelsById.get(resource.pricingModelId)!.id,
          name: pricingModelsById.get(resource.pricingModelId)!.name,
        },
      }))
    },
    // Searchable columns for ILIKE search on name and slug
    [resources.name, resources.slug],
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

      return eq(resources.id, trimmedQuery)
    }
  )
