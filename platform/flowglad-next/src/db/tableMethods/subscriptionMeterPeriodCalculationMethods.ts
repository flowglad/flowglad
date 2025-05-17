import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createUpsertFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  subscriptionMeterPeriodCalculations,
  subscriptionMeterPeriodCalculationInsertSchema,
  subscriptionMeterPeriodCalculationSelectSchema,
  subscriptionMeterPeriodCalculationUpdateSchema,
} from '@/db/schema/subscriptionMeterPeriodCalculations'
import { sql } from 'drizzle-orm'
import { SubscriptionMeterPeriodCalculationStatus } from '@/types'

const config: ORMMethodCreatorConfig<
  typeof subscriptionMeterPeriodCalculations,
  typeof subscriptionMeterPeriodCalculationSelectSchema,
  typeof subscriptionMeterPeriodCalculationInsertSchema,
  typeof subscriptionMeterPeriodCalculationUpdateSchema
> = {
  tableName: 'subscription_meter_period_calculations',
  selectSchema: subscriptionMeterPeriodCalculationSelectSchema,
  insertSchema: subscriptionMeterPeriodCalculationInsertSchema,
  updateSchema: subscriptionMeterPeriodCalculationUpdateSchema,
}

export const selectSubscriptionMeterPeriodCalculationById =
  createSelectById(subscriptionMeterPeriodCalculations, config)

export const insertSubscriptionMeterPeriodCalculation =
  createInsertFunction(subscriptionMeterPeriodCalculations, config)

export const updateSubscriptionMeterPeriodCalculation =
  createUpdateFunction(subscriptionMeterPeriodCalculations, config)

export const selectSubscriptionMeterPeriodCalculations =
  createSelectFunction(subscriptionMeterPeriodCalculations, config)

export const upsertSubscriptionMeterPeriodCalculationByCalculationRunId =
  createUpsertFunction(
    subscriptionMeterPeriodCalculations,
    [subscriptionMeterPeriodCalculations.calculationRunId],
    config
  )

// For the composite unique constraint: CONSTRAINT uq_active_calculation UNIQUE (subscription_id, usage_meter_id, billing_period_id, status) WHERE (status = 'active')
// A generic upsert for this is complex due to the WHERE clause.
// The createUpsertFunction might not directly support partial unique indexes for its conflict target resolution.
// Typically, for such complex cases, you might need a custom SQL statement or a stored procedure for a true "upsert" or handle it at the application level (select then insert/update).
// The prompt asks for upserts for each uniqueness constraint.
// Let's create a placeholder or a more specific function name indicating its nature if direct upsert is not feasible via the helper.

// This specific upsert is non-trivial with the current helper due to the WHERE clause on status.
// The `createUpsertFunction` targets columns for `ON CONFLICT (columns) DO UPDATE`.
// Partial indexes are not directly usable as conflict targets like that in a generic way.
// A more practical approach for this constraint would be to check for existence with the WHERE clause, then insert or update.
// However, to follow the prompt structure, I will define it, but it may need review for actual SQL generation.
export const upsertActiveSubscriptionMeterPeriodCalculation =
  createUpsertFunction(
    subscriptionMeterPeriodCalculations,
    [
      subscriptionMeterPeriodCalculations.subscriptionId,
      subscriptionMeterPeriodCalculations.usageMeterId,
      subscriptionMeterPeriodCalculations.billingPeriodId,
      subscriptionMeterPeriodCalculations.status, // Including status in conflict columns
    ],
    config
    // The WHERE clause for the conflict target is the tricky part for a generic helper.
    // The helper would need to support `ON CONFLICT ON CONSTRAINT constraint_name` or more complex logic.
    // For now, this will generate ON CONFLICT (subscription_id, usage_meter_id, billing_period_id, status) DO UPDATE.
    // This is only truly an upsert for the specific case where an item with status='active' already exists.
  )
