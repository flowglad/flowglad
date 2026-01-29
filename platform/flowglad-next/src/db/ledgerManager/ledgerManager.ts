import { LedgerTransactionType } from '@db-core/enums'
import { Result } from 'better-result'
import {
  type AdminCreditAdjustedLedgerCommand,
  type CreditGrantExpiredLedgerCommand,
  type LedgerCommand,
  type LedgerCommandResult,
  ledgerCommandSchema,
  type PaymentRefundedLedgerCommand,
} from '@/db/ledgerManager/ledgerManagerTypes'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  bulkInsertLedgerEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import {
  insertLedgerTransaction,
  selectLedgerTransactions,
} from '@/db/tableMethods/ledgerTransactionMethods'
import type { DbTransaction } from '@/db/types'
import type { NotFoundError } from '@/errors'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
} from '@/types'
import { selectLedgerAccounts } from '../tableMethods/ledgerAccountMethods'
import { processBillingPeriodTransitionLedgerCommand } from './billingPeriodTransitionLedgerCommand'
import { processCreditGrantRecognizedLedgerCommand } from './creditGrantRecognizedLedgerCommand'
import { processSettleInvoiceUsageCostsLedgerCommand } from './settleInvoiceUsageCostsLedgerCommand'
import { processUsageEventProcessedLedgerCommand } from './usageEventProcessedLedgerCommand'

const processAdminCreditAdjustedLedgerCommand = async (
  command: AdminCreditAdjustedLedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
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
      usageMeterId:
        command.payload.usageCreditBalanceAdjustment.usageMeterId, // Assuming general ECCA; adjust if meter-specific adjustments are possible
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

  const ledgerEntriesResult = await bulkInsertLedgerEntries(
    [ledgerEntryInput],
    transaction
  )
  if (Result.isError(ledgerEntriesResult)) {
    return Result.err(ledgerEntriesResult.error)
  }
  return Result.ok({
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: ledgerEntriesResult.value,
  })
}

const processCreditGrantExpiredLedgerCommand = async (
  command: CreditGrantExpiredLedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
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
  // FIXME: Implement LedgerEntry creation for CreditGrantExpired
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  return Result.ok({
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: [],
  })
}

const processPaymentRefundedLedgerCommand = async (
  command: PaymentRefundedLedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
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
  // FIXME: Implement LedgerEntry creation for PaymentRefunded
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction for PaymentRefunded command or retrieve its ID'
    )
  }
  return Result.ok({
    ledgerTransaction: insertedLedgerTransaction,
    ledgerEntries: [],
  })
}

export const extractLedgerManagerIdempotencyKey = (
  command: LedgerCommand
): {
  initiatingSourceType: string
  initiatingSourceId: string
} | null => {
  // Extract idempotency key based on command type
  switch (command.type) {
    case LedgerTransactionType.SettleInvoiceUsageCosts:
      return {
        initiatingSourceType:
          LedgerTransactionInitiatingSourceType.InvoiceSettlement,
        initiatingSourceId: command.payload.invoice.id,
      }
    case LedgerTransactionType.BillingPeriodTransition:
      return {
        initiatingSourceType: command.type,
        initiatingSourceId:
          command.payload.type === 'standard'
            ? command.payload.newBillingPeriod.id
            : command.payload.subscription.id,
      }
    case LedgerTransactionType.CreditGrantRecognized:
      return {
        initiatingSourceType: command.type,
        initiatingSourceId: command.payload.usageCredit.id,
      }
    case LedgerTransactionType.UsageEventProcessed:
      return {
        initiatingSourceType:
          LedgerTransactionInitiatingSourceType.UsageEvent,
        initiatingSourceId: command.payload.usageEvent.id,
      }
    case LedgerTransactionType.AdminCreditAdjusted:
      return {
        initiatingSourceType: command.type,
        initiatingSourceId:
          command.payload.usageCreditBalanceAdjustment.id,
      }
    case LedgerTransactionType.CreditGrantExpired:
      return {
        initiatingSourceType: command.type,
        initiatingSourceId: command.payload.expiredUsageCredit.id,
      }
    case LedgerTransactionType.PaymentRefunded:
      return {
        initiatingSourceType: command.type,
        initiatingSourceId: command.payload.refund.id,
      }
    default:
      return null // Should never happen
  }
}

export const processLedgerCommand = async (
  rawCommand: LedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
  const command = ledgerCommandSchema.parse(rawCommand)

  const idempotencyKey = extractLedgerManagerIdempotencyKey(command)
  if (idempotencyKey) {
    const [existingTransaction] = await selectLedgerTransactions(
      {
        type: command.type,
        initiatingSourceType: idempotencyKey.initiatingSourceType,
        initiatingSourceId: idempotencyKey.initiatingSourceId,
        organizationId: command.organizationId,
        livemode: command.livemode,
      },
      transaction
    )

    if (existingTransaction) {
      const existingEntries = await selectLedgerEntries(
        { ledgerTransactionId: existingTransaction.id },
        transaction
      )
      return Result.ok({
        ledgerTransaction: existingTransaction,
        ledgerEntries: existingEntries,
      })
    }
  }

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
