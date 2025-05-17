import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  usageCreditApplications,
  usageCreditApplicationsInsertSchema,
  usageCreditApplicationsSelectSchema,
  usageCreditApplicationsUpdateSchema,
} from '@/db/schema/usageCreditApplications'

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
