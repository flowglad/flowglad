import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  LedgerTransaction,
  ledgerTransactions,
  ledgerTransactionsInsertSchema,
  ledgerTransactionsSelectSchema,
  ledgerTransactionsUpdateSchema,
} from '@/db/schema/ledgerTransactions'
import { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof ledgerTransactions,
  typeof ledgerTransactionsSelectSchema,
  typeof ledgerTransactionsInsertSchema,
  typeof ledgerTransactionsUpdateSchema
> = {
  tableName: 'ledger_transactions',
  selectSchema: ledgerTransactionsSelectSchema,
  insertSchema: ledgerTransactionsInsertSchema,
  updateSchema: ledgerTransactionsUpdateSchema,
}

export const selectLedgerTransactionById = createSelectById(
  ledgerTransactions,
  config
)

export const insertLedgerTransaction = createInsertFunction(
  ledgerTransactions,
  config
)

export const updateLedgerTransaction = createUpdateFunction(
  ledgerTransactions,
  config
)

export const selectLedgerTransactions = createSelectFunction(
  ledgerTransactions,
  config
)

const bulkInsertOrDoNothingLedgerTransaction =
  createBulkInsertOrDoNothingFunction(ledgerTransactions, config)

export const insertLedgerTransactionOrDoNothingByIdempotencyKey =
  async (
    ledgerTransactionInsert: LedgerTransaction.Insert,
    transaction: DbTransaction
  ) => {
    return bulkInsertOrDoNothingLedgerTransaction(
      [ledgerTransactionInsert],
      [
        ledgerTransactions.idempotencyKey,
        ledgerTransactions.subscriptionId,
      ],
      transaction
    )
  }
