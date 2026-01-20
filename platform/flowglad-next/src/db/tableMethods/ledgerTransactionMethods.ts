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
import { derivePricingModelIdFromMap } from './pricingModelIdHelpers'
import {
  derivePricingModelIdFromSubscription,
  pricingModelIdsForSubscriptions,
} from './subscriptionMethods'

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
  // Collect unique subscriptionIds that need pricingModelId derivation
  const subscriptionIdsNeedingDerivation = Array.from(
    new Set(
      ledgerTransactionInserts
        .filter((insert) => !insert.pricingModelId)
        .map((insert) => insert.subscriptionId)
    )
  )

  // Batch fetch pricingModelIds for all subscriptions in one query
  const pricingModelIdMap = await pricingModelIdsForSubscriptions(
    subscriptionIdsNeedingDerivation,
    transaction
  )

  // Derive pricingModelId using the batch-fetched map
  const insertsWithPricingModelId = ledgerTransactionInserts.map(
    (insert) => {
      const pricingModelId =
        insert.pricingModelId ??
        derivePricingModelIdFromMap({
          entityId: insert.subscriptionId,
          entityType: 'subscription',
          pricingModelIdMap,
        }).unwrap()

      return {
        ...insert,
        pricingModelId,
      }
    }
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
