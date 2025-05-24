import { DbTransaction } from '@/db/types'
import {
  LedgerCommand,
  UsageEventProcessedLedgerCommand,
  BillingRunUsageProcessedLedgerCommand,
  BillingRunCreditAppliedLedgerCommand,
  AdminCreditAdjustedLedgerCommand,
  CreditGrantExpiredLedgerCommand,
  PaymentRefundedLedgerCommand,
  BillingRecalculatedLedgerCommand,
  CreditGrantRecognizedLedgerCommand,
} from '@/db/ledgerManagerTypes'
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
import { selectLedgerAccounts } from './tableMethods/ledgerAccountMethods'
import { LedgerAccount } from './schema/ledgerAccounts'

const processUsageEventProcessedLedgerCommand = async (
  command: UsageEventProcessedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.usageEvent.id,
    subscriptionId: command.subscriptionId!,
  }
  // TODO: Implement LedgerEntry creation for UsageEventProcessed
  await insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processCreditGrantRecognizedLedgerCommand = async (
  command: CreditGrantRecognizedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
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
  await bulkInsertLedgerEntries([ledgerEntryInput], transaction)
}

const processBillingRunUsageProcessedLedgerCommand = async (
  command: BillingRunUsageProcessedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.calculationRunId,
    subscriptionId: command.subscriptionId,
  }
  // TODO: Implement LedgerEntry creation for BillingRunUsageProcessed
  await insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processBillingRunCreditAppliedLedgerCommand = async (
  command: BillingRunCreditAppliedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.calculationRunId,
    subscriptionId: command.subscriptionId,
  }
  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction for BillingRunCreditApplied command or retrieve its ID'
    )
  }
  const ledgerAccounts = await selectLedgerAccounts(
    {
      organizationId: command.organizationId,
      livemode: command.livemode,
      subscriptionId: command.subscriptionId,
      usageMeterId: command.payload.usageCredits.map(
        (usageCredit) => usageCredit.usageMeterId
      ),
    },
    transaction
  )
  if (!ledgerAccounts) {
    throw new Error(
      'Failed to select ledger account for BillingRunCreditApplied command'
    )
  }
  const ledgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    ledgerAccounts.map((ledgerAccount) => [
      ledgerAccount.usageMeterId!,
      ledgerAccount,
    ])
  )
  const ledgerEntryInserts: LedgerEntry.CreditGrantRecognizedInsert[] =
    command.payload.usageCredits.map((usageCredit) => {
      const ledgerAccount = ledgerAccountsByUsageMeterId.get(
        usageCredit.usageMeterId!
      )
      if (!ledgerAccount) {
        throw new Error(
          'Failed to select ledger account for BillingRunCreditApplied command'
        )
      }
      return {
        ...ledgerEntryNulledSourceIdColumns,
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccount.id,
        subscriptionId: command.subscriptionId,
        organizationId: command.organizationId,
        livemode: command.livemode,
        entryTimestamp: new Date(),
        status: LedgerEntryStatus.Posted,
        discardedAt: null,
        direction: LedgerEntryDirection.Credit,
        entryType: LedgerEntryType.CreditGrantRecognized,
        amount: usageCredit.issuedAmount,
        description: `Credit grant ${usageCredit.id} recognized.`,
        sourceUsageCreditId: usageCredit.id,
        billingPeriodId: usageCredit.billingPeriodId ?? null,
        usageMeterId: usageCredit.usageMeterId,
        calculationRunId: command.payload.calculationRunId,
        metadata: { ledgerCommandType: command.type },
      }
    })
  await bulkInsertLedgerEntries(ledgerEntryInserts, transaction)
}

const processAdminCreditAdjustedLedgerCommand = async (
  command: AdminCreditAdjustedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
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
    entryTimestamp: new Date(),
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
    calculationRunId: null,
    metadata: { ledgerCommandType: command.type },
  }

  await bulkInsertLedgerEntries([ledgerEntryInput], transaction)
}

const processCreditGrantExpiredLedgerCommand = async (
  command: CreditGrantExpiredLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
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
  await insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processPaymentRefundedLedgerCommand = async (
  command: PaymentRefundedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
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
}

const processBillingRecalculatedLedgerCommand = async (
  command: BillingRecalculatedLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.newCalculation.id,
    subscriptionId: command.subscriptionId!,
  }
  // TODO: Implement LedgerEntry creation for BillingRecalculated
  await insertLedgerTransaction(ledgerTransactionInput, transaction)
}

export const processLedgerCommand = async (
  command: LedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
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
    case LedgerTransactionType.BillingRunUsageProcessed:
      return processBillingRunUsageProcessedLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.BillingRunCreditApplied:
      return processBillingRunCreditAppliedLedgerCommand(
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
    case LedgerTransactionType.BillingRecalculated:
      return processBillingRecalculatedLedgerCommand(
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
