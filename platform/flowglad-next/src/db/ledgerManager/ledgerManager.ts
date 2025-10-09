import { DbTransaction } from '@/db/types'
import {
  LedgerCommand,
  AdminCreditAdjustedLedgerCommand,
  CreditGrantExpiredLedgerCommand,
  PaymentRefundedLedgerCommand,
  LedgerCommandResult,
  ledgerCommandSchema,
} from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerTransactionType,
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
import { processBillingPeriodTransitionLedgerCommand } from './billingPeriodTransitionLedgerCommand'
import { processUsageEventProcessedLedgerCommand } from './usageEventProcessedLedgerCommand'
import { processCreditGrantRecognizedLedgerCommand } from './creditGrantRecognizedLedgerCommand'
import { processSettleInvoiceUsageCostsLedgerCommand } from './settleInvoiceUsageCostsLedgerCommand'

const processAdminCreditAdjustedLedgerCommand = async (
  command: AdminCreditAdjustedLedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId:
      command.payload.usageCreditBalanceAdjustment.id,
    subscriptionId: command.subscriptionId!,
  }
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )

  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction for AdminCreditAdjusted command or retrieve its ID'
    )
  }

  // Fetch LedgerAccount - assuming adjustment applies to the general subscription ECCA for now.
  // If adjustments can be meter-specific, logic to determine usageMeterId for query would be needed here,
  // potentially by fetching the original UsageCredit record using adjustedUsageCreditId.
  const [ledgerAccount] = await selectLedgerAccounts(
    {
      organizationId: command.organizationId,
      livemode: command.livemode,
      subscriptionId: command.subscriptionId!,
      usageMeterId: null, // Assuming general ECCA; adjust if meter-specific adjustments are possible
    },
    transaction
  )

  if (!ledgerAccount) {
    throw new Error(
      `Failed to select ledger account for AdminCreditAdjusted command, subscriptionId: ${command.subscriptionId}`
    )
  }

  const ledgerEntryInput: LedgerEntry.CreditBalanceAdjustedInsert = {
    ...ledgerEntryNulledSourceIdColumns,
    ledgerTransactionId: insertedLedgerTransaction.id,
    ledgerAccountId: ledgerAccount.id,
    subscriptionId: command.subscriptionId!,
    organizationId: command.organizationId,
    livemode: command.livemode,
    entryTimestamp: Date.now(),
    status: LedgerEntryStatus.Posted,
    discardedAt: null,
    direction: LedgerEntryDirection.Debit, // Debits reduce credit balance
    entryType: LedgerEntryType.CreditBalanceAdjusted,
    amount:
      command.payload.usageCreditBalanceAdjustment.amountAdjusted, // Positive value for debit amount
    description: `Adjustment ${command.payload.usageCreditBalanceAdjustment.id} for credit ${command.payload.usageCreditBalanceAdjustment.adjustedUsageCreditId}. Reason: ${command.payload.usageCreditBalanceAdjustment.reason}`,
    sourceUsageCreditId:
      command.payload.usageCreditBalanceAdjustment
        .adjustedUsageCreditId,
    sourceCreditBalanceAdjustmentId:
      command.payload.usageCreditBalanceAdjustment.id,
    sourceUsageEventId: null,
    sourceCreditApplicationId: null,
    sourceBillingPeriodCalculationId: null,
    appliedToLedgerItemId: null,
    billingPeriodId: null, // Adjustments are typically not tied to a billing period
    usageMeterId: null, // Assuming adjustment is not meter-specific unless logic above changes
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
  }
}

const processCreditGrantExpiredLedgerCommand = async (
  command: CreditGrantExpiredLedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.expiredUsageCredit.id,
    subscriptionId: command.subscriptionId!,
  }
  // TODO: Implement LedgerEntry creation for CreditGrantExpired
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  return {
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: [],
  }
}

const processPaymentRefundedLedgerCommand = async (
  command: PaymentRefundedLedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.refund.id,
    subscriptionId: command.subscriptionId!,
  }
  // TODO: Implement LedgerEntry creation for PaymentRefunded
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction for PaymentRefunded command or retrieve its ID'
    )
  }
  return {
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: [],
  }
}

export const processLedgerCommand = async (
  rawCommand: LedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const command = ledgerCommandSchema.parse(rawCommand)
  switch (command.type) {
    case LedgerTransactionType.UsageEventProcessed:
      return processUsageEventProcessedLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.CreditGrantRecognized:
      return processCreditGrantRecognizedLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.BillingPeriodTransition:
      return processBillingPeriodTransitionLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.AdminCreditAdjusted:
      return processAdminCreditAdjustedLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.CreditGrantExpired:
      return processCreditGrantExpiredLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.PaymentRefunded:
      return processPaymentRefundedLedgerCommand(command, transaction)
    case LedgerTransactionType.SettleInvoiceUsageCosts:
      return processSettleInvoiceUsageCostsLedgerCommand(
        command,
        transaction
      )
    default: {
      const _exhaustiveCheck: never = command
      console.error('Unknown ledger command type:', _exhaustiveCheck)
      throw new Error(
        `Unsupported ledger command type: ${(_exhaustiveCheck as LedgerCommand).type}`
      )
    }
  }
}
