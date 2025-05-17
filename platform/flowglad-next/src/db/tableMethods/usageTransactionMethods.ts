import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  usageTransactions,
  usageTransactionsInsertSchema,
  usageTransactionsSelectSchema,
  usageTransactionsUpdateSchema,
} from '@/db/schema/usageTransactions'

const config: ORMMethodCreatorConfig<
  typeof usageTransactions,
  typeof usageTransactionsSelectSchema,
  typeof usageTransactionsInsertSchema,
  typeof usageTransactionsUpdateSchema
> = {
  tableName: 'usage_transactions',
  selectSchema: usageTransactionsSelectSchema,
  insertSchema: usageTransactionsInsertSchema,
  updateSchema: usageTransactionsUpdateSchema,
}

export const selectUsageTransactionById = createSelectById(
  usageTransactions,
  config
)

export const insertUsageTransaction = createInsertFunction(
  usageTransactions,
  config
)

export const updateUsageTransaction = createUpdateFunction(
  usageTransactions,
  config
)

export const selectUsageTransactions = createSelectFunction(
  usageTransactions,
  config
)
