import {
  refunds,
  refundsInsertSchema,
  refundsSelectSchema,
  refundsUpdateSchema,
} from '@/db/schema/refunds'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'

const config: ORMMethodCreatorConfig<
  typeof refunds,
  typeof refundsSelectSchema,
  typeof refundsInsertSchema,
  typeof refundsUpdateSchema
> = {
  selectSchema: refundsSelectSchema,
  insertSchema: refundsInsertSchema,
  updateSchema: refundsUpdateSchema,
  tableName: 'refunds',
}

export const selectRefundById = createSelectById(refunds, config)
export const insertRefund = createInsertFunction(refunds, config)
export const updateRefund = createUpdateFunction(refunds, config)
export const selectRefunds = createSelectFunction(refunds, config)
