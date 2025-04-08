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
} from '@/db/tableUtils'
import {
  UsageMeter,
  usageMeters,
  usageMetersInsertSchema,
  usageMetersSelectSchema,
  usageMetersUpdateSchema,
} from '@/db/schema/usageMeters'
import { DbTransaction } from '@/db/types'
import { catalogs, catalogsSelectSchema } from '@/db/schema/catalogs'
import { eq } from 'drizzle-orm'

const config: ORMMethodCreatorConfig<
  typeof usageMeters,
  typeof usageMetersSelectSchema,
  typeof usageMetersInsertSchema,
  typeof usageMetersUpdateSchema
> = {
  selectSchema: usageMetersSelectSchema,
  insertSchema: usageMetersInsertSchema,
  updateSchema: usageMetersUpdateSchema,
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

export const selectUsageMetersPaginated =
  createPaginatedSelectFunction(usageMeters, config)

export const selectUsageMeterTableRows = async (
  whereConditions: SelectConditions<typeof usageMeters>,
  transaction: DbTransaction
): Promise<UsageMeter.TableRow[]> => {
  let query = transaction
    .select({
      usageMeter: usageMeters,
      catalog: catalogs,
    })
    .from(usageMeters)
    .innerJoin(catalogs, eq(usageMeters.catalogId, catalogs.id))
    .$dynamic()

  if (!R.isEmpty(whereConditions)) {
    query = query.where(
      whereClauseFromObject(usageMeters, whereConditions)
    )
  }

  const result = await query

  return result.map((item) => ({
    usageMeter: usageMetersSelectSchema.parse(item.usageMeter),
    catalog: catalogsSelectSchema.parse(item.catalog),
  }))
}
