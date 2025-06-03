import { DbTransaction } from '@/db/types'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
} from '@/types'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerAccounts } from '../tableMethods/ledgerAccountMethods'
import {
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
    subscriptionId: command.subscriptionId!,
  }
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )

  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction for PromoCreditGranted command or retrieve its ID'
    )
  }
  const [ledgerAccount] = await selectLedgerAccounts(
    {
      organizationId: command.organizationId,
      livemode: command.livemode,
      subscriptionId: command.subscriptionId!,
      usageMeterId: command.payload.usageCredit.usageMeterId,
    },
    transaction
  )
  if (!ledgerAccount) {
    throw new Error(
      'Failed to select ledger account for PromoCreditGranted command'
    )
  }
  const ledgerEntryInput: LedgerEntry.CreditGrantRecognizedInsert = {
    ...ledgerEntryNulledSourceIdColumns,
    ledgerTransactionId: insertedLedgerTransaction.id,
    ledgerAccountId: ledgerAccount.id,
    subscriptionId: command.subscriptionId!,
    organizationId: command.organizationId,
    livemode: command.livemode,
    entryTimestamp: new Date(),
    status: LedgerEntryStatus.Posted,
    discardedAt: null,
    direction: LedgerEntryDirection.Credit,
    entryType: LedgerEntryType.CreditGrantRecognized,
    amount: command.payload.usageCredit.issuedAmount,
    description: `Promotional credit ${command.payload.usageCredit.id} granted.`,
    sourceUsageCreditId: command.payload.usageCredit.id,
    billingPeriodId:
      command.payload.usageCredit.billingPeriodId ?? null,
    usageMeterId: command.payload.usageCredit.usageMeterId ?? null,
    calculationRunId: null,
    metadata: { ledgerCommandType: command.type },
  }
  const [insertedLedgerEntry] = await bulkInsertLedgerEntries(
    [ledgerEntryInput],
    transaction
  )
  return {
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: [insertedLedgerEntry],
  }
}
