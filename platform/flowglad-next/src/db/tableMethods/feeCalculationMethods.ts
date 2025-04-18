import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  FeeCalculation,
  feeCalculations,
  feeCalculationsInsertSchema,
  feeCalculationsSelectSchema,
  feeCalculationsUpdateSchema,
} from '@/db/schema/feeCalculations'
import { DbTransaction } from '@/db/types'

const config: ORMMethodCreatorConfig<
  typeof feeCalculations,
  typeof feeCalculationsSelectSchema,
  typeof feeCalculationsInsertSchema,
  typeof feeCalculationsUpdateSchema
> = {
  selectSchema: feeCalculationsSelectSchema,
  insertSchema: feeCalculationsInsertSchema,
  updateSchema: feeCalculationsUpdateSchema,
  tableName: 'fee_calculations',
}

export const selectFeeCalculationById = createSelectById(
  feeCalculations,
  config
)

export const insertFeeCalculation = createInsertFunction(
  feeCalculations,
  config
)

export const updateFeeCalculation = createUpdateFunction(
  feeCalculations,
  config
)

export const selectFeeCalculations = createSelectFunction(
  feeCalculations,
  config
)

export const selectLatestFeeCalculation = async (
  whereClause: Partial<FeeCalculation.Record>,
  transaction: DbTransaction
): Promise<FeeCalculation.Record | null> => {
  const feeCalculations = await selectFeeCalculations(
    whereClause,
    transaction
  )
  const latestFeeCalculation = feeCalculations.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0]
  if (!latestFeeCalculation) {
    return null
  }
  return latestFeeCalculation
}
