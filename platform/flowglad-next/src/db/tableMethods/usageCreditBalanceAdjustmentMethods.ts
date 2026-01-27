import {
  type UsageCreditBalanceAdjustment,
  usageCreditBalanceAdjustments,
  usageCreditBalanceAdjustmentsInsertSchema,
  usageCreditBalanceAdjustmentsSelectSchema,
  usageCreditBalanceAdjustmentsUpdateSchema,
} from '@/db/schema/usageCreditBalanceAdjustments'
import {
  createInsertFunction,
  createSelectByIdResult,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { derivePricingModelIdFromUsageCredit } from './usageCreditMethods'

const config: ORMMethodCreatorConfig<
  typeof usageCreditBalanceAdjustments,
  typeof usageCreditBalanceAdjustmentsSelectSchema,
  typeof usageCreditBalanceAdjustmentsInsertSchema,
  typeof usageCreditBalanceAdjustmentsUpdateSchema
> = {
  tableName: 'usage_credit_balance_adjustments',
  selectSchema: usageCreditBalanceAdjustmentsSelectSchema,
  insertSchema: usageCreditBalanceAdjustmentsInsertSchema,
  updateSchema: usageCreditBalanceAdjustmentsUpdateSchema,
}

export const selectUsageCreditBalanceAdjustmentById =
  createSelectByIdResult(usageCreditBalanceAdjustments, config)

const baseInsertUsageCreditBalanceAdjustment = createInsertFunction(
  usageCreditBalanceAdjustments,
  config
)

export const insertUsageCreditBalanceAdjustment = async (
  usageCreditBalanceAdjustmentInsert: UsageCreditBalanceAdjustment.Insert,
  transaction: DbTransaction
): Promise<UsageCreditBalanceAdjustment.Record> => {
  const pricingModelId =
    usageCreditBalanceAdjustmentInsert.pricingModelId
      ? usageCreditBalanceAdjustmentInsert.pricingModelId
      : await derivePricingModelIdFromUsageCredit(
          usageCreditBalanceAdjustmentInsert.adjustedUsageCreditId,
          transaction
        )
  return baseInsertUsageCreditBalanceAdjustment(
    {
      ...usageCreditBalanceAdjustmentInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateUsageCreditBalanceAdjustment =
  createUpdateFunction(usageCreditBalanceAdjustments, config)

export const selectUsageCreditBalanceAdjustments =
  createSelectFunction(usageCreditBalanceAdjustments, config)
