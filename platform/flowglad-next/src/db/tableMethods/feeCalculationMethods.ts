import {
  type FeeCalculation,
  feeCalculations,
  feeCalculationsInsertSchema,
  feeCalculationsSelectSchema,
  feeCalculationsUpdateSchema,
} from '@/db/schema/feeCalculations'
import {
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { derivePricingModelIdFromBillingPeriod } from './billingPeriodMethods'
import { selectCheckoutSessionById } from './checkoutSessionMethods'

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

/**
 * Derives pricingModelId for a fee calculation with COALESCE logic.
 * Priority: billingPeriodId > checkoutSessionId
 * Used for fee calculation inserts.
 *
 * According to the migration backfill query from the gameplan:
 * UPDATE fee_calculations SET pricing_model_id = COALESCE(
 *   (SELECT pricing_model_id FROM billing_periods WHERE billing_periods.id = fee_calculations.billing_period_id),
 *   (SELECT pricing_model_id FROM checkout_sessions WHERE checkout_sessions.id = fee_calculations.checkout_session_id)
 * )
 */
export const derivePricingModelIdForFeeCalculation = async (
  data: {
    billingPeriodId?: string | null
    checkoutSessionId?: string | null
  },
  transaction: DbTransaction
): Promise<string> => {
  // Try billing period first (for subscription payment fee calculations)
  if (data.billingPeriodId) {
    return await derivePricingModelIdFromBillingPeriod(
      data.billingPeriodId,
      transaction
    )
  }

  // Try checkout session second (for checkout session payment fee calculations)
  if (data.checkoutSessionId) {
    const checkoutSession = await selectCheckoutSessionById(
      data.checkoutSessionId,
      transaction
    )
    return checkoutSession.pricingModelId
  }

  throw new Error(
    'Cannot derive pricingModelId for fee calculation: no valid parent found (need billingPeriodId or checkoutSessionId)'
  )
}

const baseInsertFeeCalculation = createInsertFunction(
  feeCalculations,
  config
)

export const insertFeeCalculation = async (
  insertData: FeeCalculation.Insert,
  transaction: DbTransaction
): Promise<FeeCalculation.Record> => {
  const pricingModelId = insertData.pricingModelId
    ? insertData.pricingModelId
    : await derivePricingModelIdForFeeCalculation(
        {
          billingPeriodId: insertData.billingPeriodId,
          checkoutSessionId: insertData.checkoutSessionId,
        },
        transaction
      )
  return baseInsertFeeCalculation(
    {
      ...insertData,
      pricingModelId,
    } as FeeCalculation.Insert,
    transaction
  )
}

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
    (a, b) => b.createdAt - a.createdAt
  )[0]
  if (!latestFeeCalculation) {
    return null
  }
  return latestFeeCalculation
}
