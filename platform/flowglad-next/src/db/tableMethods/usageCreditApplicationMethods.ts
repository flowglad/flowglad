import {
  type UsageCreditApplication,
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
import type { DbTransaction } from '@/db/types'
import { derivePricingModelIdFromUsageCredit } from './usageCreditMethods'

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

const baseInsertUsageCreditApplication = createInsertFunction(
  usageCreditApplications,
  config
)

export const insertUsageCreditApplication = async (
  usageCreditApplicationInsert: UsageCreditApplication.Insert,
  transaction: DbTransaction
): Promise<UsageCreditApplication.Record> => {
  const pricingModelId = await derivePricingModelIdFromUsageCredit(
    usageCreditApplicationInsert.usageCreditId,
    transaction
  )
  return baseInsertUsageCreditApplication(
    {
      ...usageCreditApplicationInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateUsageCreditApplication = createUpdateFunction(
  usageCreditApplications,
  config
)

export const selectUsageCreditApplications = createSelectFunction(
  usageCreditApplications,
  config
)

const baseBulkInsertUsageCreditApplications =
  createBulkInsertFunction(usageCreditApplications, config)

export const bulkInsertUsageCreditApplications = async (
  inserts: UsageCreditApplication.Insert[],
  transaction: DbTransaction
): Promise<UsageCreditApplication.Record[]> => {
  // Derive pricingModelId for each insert
  const insertsWithPricingModelId = await Promise.all(
    inserts.map(async (insert) => {
      const pricingModelId =
        await derivePricingModelIdFromUsageCredit(
          insert.usageCreditId,
          transaction
        )
      return {
        ...insert,
        pricingModelId,
      }
    })
  )
  return baseBulkInsertUsageCreditApplications(
    insertsWithPricingModelId,
    transaction
  )
}
