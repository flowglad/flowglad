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
} from '@/db/schema/ledgerEntries'
import { DbTransaction } from '../types'
import { LedgerEntryStatus } from '@/types'
import { and, eq, inArray } from 'drizzle-orm'
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
  await transaction
    .update(ledgerEntries)
    .set({
      expiredAt: new Date(),
      expiredAtLedgerTransactionId: ledgerTransaction.id,
    })
    .where(
      and(
        inArray(
          ledgerEntries.id,
          pendingLedgerEntries.map((item) => item.id)
        ),
        eq(
          ledgerEntries.subscriptionId,
          ledgerTransaction.subscriptionId
        )
      )
    )
    .returning()

  return pendingLedgerEntries
}
