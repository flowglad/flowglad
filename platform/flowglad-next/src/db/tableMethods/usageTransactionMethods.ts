import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  UsageTransaction,
  usageTransactions,
  usageTransactionsInsertSchema,
  usageTransactionsSelectSchema,
  usageTransactionsUpdateSchema,
} from '@/db/schema/usageTransactions'
import { DbTransaction } from '../types'

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

const bulkInsertOrDoNothingUsageTransaction =
  createBulkInsertOrDoNothingFunction(usageTransactions, config)

export const insertUsageTransactionOrDoNothingByIdempotencyKey =
  async (
    usageTransactionInsert: UsageTransaction.Insert,
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingUsageTransaction(
      [usageTransactionInsert],
      [
        usageTransactions.idempotencyKey,
        usageTransactions.usageMeterId,
        usageTransactions.subscriptionId,
      ],
      transaction
    )
  }
