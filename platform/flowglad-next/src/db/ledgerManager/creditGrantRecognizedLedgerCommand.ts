import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import type { DbTransaction } from '@/db/types'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
} from '@/types'
import { CacheDependency } from '@/utils/cache'
import { findOrCreateLedgerAccountsForSubscriptionAndUsageMeters } from '../tableMethods/ledgerAccountMethods'
import type {
  CreditGrantRecognizedLedgerCommand,
  LedgerCommandResult,
} from './ledgerManagerTypes'

export const processCreditGrantRecognizedLedgerCommand = async (
  command: CreditGrantRecognizedLedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.usageCredit.id,
    subscriptionId: command.subscriptionId,
  }
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )

  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction for CreditGrantRecognized command or retrieve its ID'
    )
  }

  // Ensure usageMeterId exists before creating/finding ledger account
  if (!command.payload.usageCredit.usageMeterId) {
    throw new Error(
      'Cannot process Credit Grant Recognized command: usage credit must have a usageMeterId'
    )
  }

  // Find or create ledger account for this subscription and usage meter
  // This handles the case where a customer on a free plan doesn't have ledger accounts yet
  const [ledgerAccount] =
    await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
      {
        subscriptionId: command.subscriptionId,
        usageMeterIds: [command.payload.usageCredit.usageMeterId],
      },
      transaction
    )
  if (!ledgerAccount) {
    throw new Error(
      'Failed to find or create ledger account for Credit Grant Recognized command'
    )
  }
  const ledgerEntryInput: LedgerEntry.CreditGrantRecognizedInsert = {
    ...ledgerEntryNulledSourceIdColumns,
    ledgerTransactionId: insertedLedgerTransaction.id,
    ledgerAccountId: ledgerAccount.id,
    subscriptionId: command.subscriptionId,
    organizationId: command.organizationId,
    livemode: command.livemode,
    entryTimestamp: Date.now(),
    status: LedgerEntryStatus.Posted,
    discardedAt: null,
    direction: LedgerEntryDirection.Credit,
    entryType: LedgerEntryType.CreditGrantRecognized,
    amount: command.payload.usageCredit.issuedAmount,
    description: `Promotional credit ${command.payload.usageCredit.id} granted.`,
    sourceUsageCreditId: command.payload.usageCredit.id,
    billingPeriodId:
      command.payload.usageCredit.billingPeriodId ?? null,
    usageMeterId: command.payload.usageCredit.usageMeterId,
    claimedByBillingRunId: null,
    metadata: { ledgerCommandType: command.type },
  }
  const [insertedLedgerEntry] = await bulkInsertLedgerEntries(
    [ledgerEntryInput],
    transaction
  )
  return {
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: [insertedLedgerEntry],
    // Invalidate meter balances cache for this subscription
    cacheInvalidations: [
      CacheDependency.subscriptionLedger(command.subscriptionId),
    ],
  }
}
