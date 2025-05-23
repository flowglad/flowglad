import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  ledgerEntries,
  ledgerEntriesInsertSchema,
  ledgerEntriesSelectSchema,
  ledgerEntriesUpdateSchema,
  LedgerEntry,
} from '@/db/schema/ledgerEntries'
import { DbTransaction } from '../types'
import { LedgerEntryDirection, LedgerEntryStatus } from '@/types'
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { LedgerTransaction } from '../schema/ledgerTransactions'

const config: ORMMethodCreatorConfig<
  typeof ledgerEntries,
  typeof ledgerEntriesSelectSchema,
  typeof ledgerEntriesInsertSchema,
  typeof ledgerEntriesUpdateSchema
> = {
  selectSchema: ledgerEntriesSelectSchema,
  insertSchema: ledgerEntriesInsertSchema,
  updateSchema: ledgerEntriesUpdateSchema,
  tableName: 'usage_ledger_items',
}

export const selectLedgerEntryById = createSelectById(
  ledgerEntries,
  config
)
export const insertLedgerEntry = createInsertFunction(
  ledgerEntries,
  config
)
export const updateLedgerEntry = createUpdateFunction(
  ledgerEntries,
  config
)
export const selectLedgerEntries = createSelectFunction(
  ledgerEntries,
  config
)

export const bulkInsertLedgerEntries = async (
  data: Array<typeof ledgerEntries.$inferInsert>,
  transaction: DbTransaction
) => {
  if (data.length === 0) {
    return []
  }
  // Assuming ledgerEntriesInsertSchema can validate an array, or we validate each item if needed.
  // For simplicity, direct insert is used here. Validation should occur before calling this.
  return transaction.insert(ledgerEntries).values(data).returning()
}

export const expirePendingLedgerEntriesForPayment = async (
  paymentId: string,
  ledgerTransaction: LedgerTransaction.Record,
  transaction: DbTransaction
) => {
  const pendingLedgerEntries = await selectLedgerEntries(
    {
      sourcePaymentId: paymentId,
      status: LedgerEntryStatus.Pending,
    },
    transaction
  )
  const whereClause = and(
    inArray(
      ledgerEntries.id,
      pendingLedgerEntries.map((item) => item.id)
    ),
    eq(
      ledgerEntries.subscriptionId,
      ledgerTransaction.subscriptionId
    ),
    eq(ledgerEntries.ledgerTransactionId, ledgerTransaction.id)
  )

  const rawResults = await transaction
    .update(ledgerEntries)
    .set({
      expiredAt: new Date(),
      expiredAtLedgerTransactionId: ledgerTransaction.id,
    })
    .where(whereClause)
    .returning()
  return rawResults.map((item) =>
    ledgerEntriesSelectSchema.parse(item)
  )
}

const balanceTypeWhereStatement = (
  balanceType: 'pending' | 'posted' | 'available'
) => {
  switch (balanceType) {
    case 'posted':
      return eq(ledgerEntries.status, LedgerEntryStatus.Posted)
    case 'pending':
      return inArray(ledgerEntries.status, [
        LedgerEntryStatus.Pending,
        LedgerEntryStatus.Posted,
      ])
    case 'available':
      /**
       * include both posted OR
       * pending + debit
       * (exclude pending + credit)
       */
      return or(
        eq(ledgerEntries.status, LedgerEntryStatus.Posted),
        and(
          eq(ledgerEntries.status, LedgerEntryStatus.Pending),
          eq(ledgerEntries.direction, LedgerEntryDirection.Debit)
        )
      )
  }
}

export const aggregateBalanceForLedgerAccountFromEntries = async (
  ledgerAccountId: string,
  balanceType: 'pending' | 'posted' | 'available',
  transaction: DbTransaction
) => {
  const result = await transaction
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.ledgerAccountId, ledgerAccountId),
        or(
          isNull(ledgerEntries.discardedAt),
          gt(ledgerEntries.discardedAt, new Date())
        ),
        balanceTypeWhereStatement(balanceType)
      )
    )
  const balance = result.reduce((acc, entry) => {
    return entry.direction === LedgerEntryDirection.Credit
      ? acc + entry.amount
      : acc - entry.amount
  }, 0)
  return balance
}
