import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  usageMeters,
  usageMetersInsertSchema,
  usageMetersSelectSchema,
  usageMetersUpdateSchema,
} from '@/db/schema/usageMeters'

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
