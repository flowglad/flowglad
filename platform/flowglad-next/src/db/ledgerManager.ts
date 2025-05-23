import {
  AdminTransactionParams,
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  LedgerCommand,
  UsageEventProcessedLedgerCommand,
  PaymentConfirmedLedgerCommand,
  PromoCreditGrantedLedgerCommand,
  BillingRunUsageProcessedLedgerCommand,
  BillingRunCreditAppliedLedgerCommand,
  AdminCreditAdjustedLedgerCommand,
  CreditGrantExpiredLedgerCommand,
  PaymentRefundedLedgerCommand,
  BillingRecalculatedLedgerCommand,
} from '@/db/ledgerManagerTypes'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
} from '@/types'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import { PaymentStatus } from '@/types'

const processUsageEventProcessedLedgerCommand = async (
  command: UsageEventProcessedLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processPaymentConfirmedLedgerCommand = async (
  command: PaymentConfirmedLedgerCommand,
  transaction: DbTransaction
) => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.payment.id,
    subscriptionId: command.subscriptionId!,
  }
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processPromoCreditGrantedLedgerCommand = async (
  command: PromoCreditGrantedLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processBillingRunUsageProcessedLedgerCommand = async (
  command: BillingRunUsageProcessedLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processBillingRunCreditAppliedLedgerCommand = async (
  command: BillingRunCreditAppliedLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processAdminCreditAdjustedLedgerCommand = async (
  command: AdminCreditAdjustedLedgerCommand,
  transaction: DbTransaction
) => {
  // TODO: Fetch the associated UsageCredit to get subscriptionId using command.payload.usageCreditBalanceAdjustment.adjustedUsageCreditId
  // const usageCredit = await getUsageCreditById(command.payload.usageCreditBalanceAdjustment.adjustedUsageCreditId, transaction);
  // const subscriptionId = usageCredit?.subscriptionId ?? undefined;

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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processCreditGrantExpiredLedgerCommand = async (
  command: CreditGrantExpiredLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processPaymentRefundedLedgerCommand = async (
  command: PaymentRefundedLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

const processBillingRecalculatedLedgerCommand = async (
  command: BillingRecalculatedLedgerCommand,
  transaction: DbTransaction
) => {
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
  return insertLedgerTransaction(ledgerTransactionInput, transaction)
}

export const processLedgerCommand = (
  command: LedgerCommand,
  transaction: DbTransaction
) => {
  switch (command.type) {
    case LedgerTransactionType.UsageEventProcessed:
      return processUsageEventProcessedLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.PaymentConfirmed:
      return processPaymentConfirmedLedgerCommand(
        command,
        transaction
      )
    case LedgerTransactionType.PromoCreditGranted:
      return processPromoCreditGrantedLedgerCommand(
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
