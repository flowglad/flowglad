import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  usageCredits,
  usageCreditsInsertSchema,
  usageCreditsSelectSchema,
  usageCreditsUpdateSchema,
  UsageCredit,
} from '@/db/schema/usageCredits'

const config: ORMMethodCreatorConfig<
  typeof usageCredits,
  typeof usageCreditsSelectSchema,
  typeof usageCreditsInsertSchema,
  typeof usageCreditsUpdateSchema
> = {
  tableName: 'usage_credits',
  selectSchema: usageCreditsSelectSchema,
  insertSchema: usageCreditsInsertSchema,
  updateSchema: usageCreditsUpdateSchema,
}

export const selectUsageCreditById = createSelectById(
  usageCredits,
  config
)

export const insertUsageCredit = createInsertFunction(
  usageCredits,
  config
)

export const updateUsageCredit = createUpdateFunction(
  usageCredits,
  config
)

export const selectUsageCredits = createSelectFunction(
  usageCredits,
  config
)
