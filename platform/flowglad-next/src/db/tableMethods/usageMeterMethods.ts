import * as R from 'ramda'
import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
  SelectConditions,
  whereClauseFromObject,
  createCursorPaginatedSelectFunction,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  UsageMeter,
  usageMeters,
  usageMetersInsertSchema,
  usageMetersSelectSchema,
  usageMetersUpdateSchema,
  usageMetersTableRowDataSchema,
} from '@/db/schema/usageMeters'
import { DbTransaction } from '@/db/types'
import {
  pricingModels,
  pricingModelsSelectSchema,
} from '@/db/schema/pricingModels'
import { eq } from 'drizzle-orm'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'

const config: ORMMethodCreatorConfig<
  typeof usageMeters,
  typeof usageMetersSelectSchema,
  typeof usageMetersInsertSchema,
  typeof usageMetersUpdateSchema
> = {
  selectSchema: usageMetersSelectSchema,
  insertSchema: usageMetersInsertSchema,
  updateSchema: usageMetersUpdateSchema,
  tableName: 'usage_meters',
}

export const selectUsageMeterById = createSelectById(
  usageMeters,
  config
)

export const insertUsageMeter = createInsertFunction(
  usageMeters,
  config
)

export const updateUsageMeter = createUpdateFunction(
  usageMeters,
  config
)

export const selectUsageMeters = createSelectFunction(
  usageMeters,
  config
)

export const bulkInsertOrDoNothingUsageMeters =
  createBulkInsertOrDoNothingFunction(usageMeters, config)

export const bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId =
  async (
    inserts: UsageMeter.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingUsageMeters(
      inserts,
      [
        usageMeters.slug,
        usageMeters.pricingModelId,
        usageMeters.organizationId,
      ],
      transaction
    )
  }

export const selectUsageMetersPaginated =
  createPaginatedSelectFunction(usageMeters, config)

export const selectUsageMetersCursorPaginated =
  createCursorPaginatedSelectFunction(
    usageMeters,
    config,
    usageMetersTableRowDataSchema,
    async (data, transaction) => {
      const pricingModelIds = data.map((item) => item.pricingModelId)
      const pricingModels = await selectPricingModels(
        { id: pricingModelIds },
        transaction
      )
      const pricingModelsById = new Map(
        pricingModels.map((pricingModel) => [
          pricingModel.id,
          pricingModel,
        ])
      )

      return data.map((item) => {
        const pricingModel = pricingModelsById.get(
          item.pricingModelId
        )
        if (!pricingModel) {
          throw new Error(
            `PricingModel not found for usage meter ${item.id}`
          )
        }
        return {
          usageMeter: item,
          pricingModel: {
            id: pricingModel.id,
            name: pricingModel.name,
          },
        }
      })
    },
    // Searchable columns for usage meters table
    [usageMeters.name, usageMeters.slug]
  )
