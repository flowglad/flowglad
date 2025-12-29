import {
  type LedgerTransaction,
  ledgerTransactions,
  ledgerTransactionsInsertSchema,
  ledgerTransactionsSelectSchema,
  ledgerTransactionsUpdateSchema,
} from '@/db/schema/ledgerTransactions'
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '../types'
import { derivePricingModelIdFromSubscription } from './subscriptionMethods'

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

const baseInsertLedgerTransaction = createInsertFunction(
  ledgerTransactions,
  config
)

export const insertLedgerTransaction = async (
  ledgerTransactionInsert: LedgerTransaction.Insert,
  transaction: DbTransaction
): Promise<LedgerTransaction.Record> => {
  const pricingModelId =
    ledgerTransactionInsert.pricingModelId ??
    (await derivePricingModelIdFromSubscription(
      ledgerTransactionInsert.subscriptionId,
      transaction
    ))
  return baseInsertLedgerTransaction(
    {
      ...ledgerTransactionInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updateLedgerTransaction = createUpdateFunction(
  ledgerTransactions,
  config
)

export const selectLedgerTransactions = createSelectFunction(
  ledgerTransactions,
  config
)

const baseBulkInsertOrDoNothingLedgerTransaction =
  createBulkInsertOrDoNothingFunction(ledgerTransactions, config)

const bulkInsertOrDoNothingLedgerTransaction = async (
  ledgerTransactionInserts: LedgerTransaction.Insert[],
  conflictColumns: Parameters<
    typeof baseBulkInsertOrDoNothingLedgerTransaction
  >[1],
  transaction: DbTransaction
) => {
  // Derive pricingModelId if not provided
  const insertsWithPricingModelId = await Promise.all(
    ledgerTransactionInserts.map(async (insert) => {
      const pricingModelId =
        insert.pricingModelId ??
        (await derivePricingModelIdFromSubscription(
          insert.subscriptionId,
          transaction
        ))
      return {
        ...insert,
        pricingModelId,
      }
    })
  )
  return baseBulkInsertOrDoNothingLedgerTransaction(
    insertsWithPricingModelId,
    conflictColumns,
    transaction
  )
}

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
