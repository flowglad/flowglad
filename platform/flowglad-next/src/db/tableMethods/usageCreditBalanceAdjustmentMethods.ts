import {
  usageCreditBalanceAdjustments,
  usageCreditBalanceAdjustmentsInsertSchema,
  usageCreditBalanceAdjustmentsSelectSchema,
  usageCreditBalanceAdjustmentsUpdateSchema,
} from '@/db/schema/usageCreditBalanceAdjustments'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'

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
  createSelectById(usageCreditBalanceAdjustments, config)

export const insertUsageCreditBalanceAdjustment =
  createInsertFunction(usageCreditBalanceAdjustments, config)

export const updateUsageCreditBalanceAdjustment =
  createUpdateFunction(usageCreditBalanceAdjustments, config)

export const selectUsageCreditBalanceAdjustments =
  createSelectFunction(usageCreditBalanceAdjustments, config)
