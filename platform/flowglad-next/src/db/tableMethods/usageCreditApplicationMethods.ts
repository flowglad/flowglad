import {
  usageCreditApplications,
  usageCreditApplicationsInsertSchema,
  usageCreditApplicationsSelectSchema,
  usageCreditApplicationsUpdateSchema,
} from '@/db/schema/usageCreditApplications'
import {
  createBulkInsertFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'

const config: ORMMethodCreatorConfig<
  typeof usageCreditApplications,
  typeof usageCreditApplicationsSelectSchema,
  typeof usageCreditApplicationsInsertSchema,
  typeof usageCreditApplicationsUpdateSchema
> = {
  tableName: 'usage_credit_applications',
  selectSchema: usageCreditApplicationsSelectSchema,
  insertSchema: usageCreditApplicationsInsertSchema,
  updateSchema: usageCreditApplicationsUpdateSchema,
}

export const selectUsageCreditApplicationById = createSelectById(
  usageCreditApplications,
  config
)

export const insertUsageCreditApplication = createInsertFunction(
  usageCreditApplications,
  config
)

export const updateUsageCreditApplication = createUpdateFunction(
  usageCreditApplications,
  config
)

export const selectUsageCreditApplications = createSelectFunction(
  usageCreditApplications,
  config
)

export const bulkInsertUsageCreditApplications =
  createBulkInsertFunction(usageCreditApplications, config)
