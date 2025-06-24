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
import { catalogs, catalogsSelectSchema } from '@/db/schema/catalogs'
import { eq } from 'drizzle-orm'
import { selectCatalogs } from '@/db/tableMethods/catalogMethods'

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

export const bulkInsertOrDoNothingUsageMetersBySlugAndCatalogId =
  async (
    inserts: UsageMeter.Insert[],
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingUsageMeters(
      inserts,
      [
        usageMeters.slug,
        usageMeters.catalogId,
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
      const catalogIds = data.map((item) => item.catalogId)
      const catalogs = await selectCatalogs(
        { id: catalogIds },
        transaction
      )
      const catalogsById = new Map(
        catalogs.map((catalog) => [catalog.id, catalog])
      )

      return data.map((item) => {
        const catalog = catalogsById.get(item.catalogId)
        if (!catalog) {
          throw new Error(
            `Catalog not found for usage meter ${item.id}`
          )
        }
        return {
          usageMeter: item,
          catalog: {
            id: catalog.id,
            name: catalog.name,
          },
        }
      })
    }
  )
