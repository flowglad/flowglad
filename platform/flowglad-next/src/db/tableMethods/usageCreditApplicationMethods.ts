import {
  type UsageCreditApplication,
  usageCreditApplications,
  usageCreditApplicationsInsertSchema,
  usageCreditApplicationsSelectSchema,
  usageCreditApplicationsUpdateSchema,
} from '@db-core/schema/usageCreditApplications'
import {
  createBulkInsertFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@db-core/tableUtils'
import type { DbTransaction } from '@/db/types'
import { panic } from '@/errors'
import {
  derivePricingModelIdFromUsageCredit,
  pricingModelIdsForUsageCredits,
} from './usageCreditMethods'

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
  const pricingModelId = usageCreditApplicationInsert.pricingModelId
    ? usageCreditApplicationInsert.pricingModelId
    : await derivePricingModelIdFromUsageCredit(
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
  const pricingModelIdMap = await pricingModelIdsForUsageCredits(
    inserts.map((insert) => insert.usageCreditId),
    transaction
  )
  const insertsWithPricingModelId = inserts.map(
    (insert): UsageCreditApplication.Insert => {
      const pricingModelId =
        insert.pricingModelId ??
        pricingModelIdMap.get(insert.usageCreditId)
      if (!pricingModelId) {
        panic(
          `Pricing model id not found for usage credit ${insert.usageCreditId}`
        )
      }
      return {
        ...insert,
        pricingModelId,
      }
    }
  )
  return baseBulkInsertUsageCreditApplications(
    insertsWithPricingModelId,
    transaction
  )
}
