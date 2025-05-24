import { UsageEvent } from '@/db/schema/usageEvents'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { Payment } from '@/db/schema/payments'
import { insertLedgerEntry } from '@/db/tableMethods/ledgerEntryMethods'
import {
  insertLedgerTransaction,
  insertLedgerTransactionOrDoNothingByIdempotencyKey,
} from '@/db/tableMethods/ledgerTransactionMethods'
import { DbTransaction } from '@/db/types'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  PaymentStatus,
} from '@/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import { UsageCredit } from '@/db/schema/usageCredits'

interface UsageLedgerTransactionResult {
  ledgerEntries: LedgerEntry.Record[]
  /**
   * Returns the usage transaction if it was created, otherwise null if the event was already recorded.
   */
  ledgerTransaction: LedgerTransaction.Record | null
}

interface CreateLedgerTransactionParams {
  livemode: boolean
  organizationId: string
  description: string
  initiatingSourceId: string
  subscriptionId: string
  metadata: Record<string, any>
}

export const createUsageEventLedgerTransaction = async (
  {
    usageEvent,
    organizationId,
  }: { usageEvent: UsageEvent.Record; organizationId: string },
  transaction: DbTransaction
): Promise<UsageLedgerTransactionResult> => {
  if (usageEvent.amount <= 0) {
    throw new Error(
      `Usage event amount must be 0 or greater. Received ${usageEvent.amount} for usage event ${usageEvent.id}`
    )
  }

  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: usageEvent.livemode,
      organizationId,
      description: `Ingesting Usage Event ${usageEvent.id}`,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.UsageEvent,
      initiatingSourceId: usageEvent.id,
      subscriptionId: usageEvent.subscriptionId,
      type: LedgerTransactionType.UsageEventProcessed,
      metadata: {},
    },
    transaction
  )

  const [ledgerAccount] = await selectLedgerAccounts(
    {
      subscriptionId: usageEvent.subscriptionId,
      usageMeterId: usageEvent.usageMeterId,
    },
    transaction
  )
  const ledgerEntries = await insertLedgerEntry(
    {
      ...ledgerEntryNulledSourceIdColumns,
      sourceUsageEventId: usageEvent.id,
      status: LedgerEntryStatus.Posted,
      livemode: usageEvent.livemode,
      organizationId,
      ledgerTransactionId: ledgerTransaction.id,
      subscriptionId: usageEvent.subscriptionId,
      direction: LedgerEntryDirection.Debit,
      entryType: LedgerEntryType.UsageCost,
      amount: usageEvent.amount,
      description: `Ingesting Usage Event ${usageEvent.id}`,
      ledgerAccountId: ledgerAccount.id,
      metadata: {
        usageEventId: usageEvent.id,
      },
      entryTimestamp: usageEvent.createdAt,
      expiredAt: null,
      discardedAt: null,
    },
    transaction
  )
  return {
    ledgerEntries: [ledgerEntries],
    ledgerTransaction,
  }
}

export const createCreditGrantRecognizedLedgerTransaction = async (
  params: CreateLedgerTransactionParams,
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.CreditGrant,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.CreditGrantRecognized,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}

export const createBillingRunUsageProcessedLedgerTransaction = async (
  params: {
    livemode: boolean
    organizationId: string
    description: string
    initiatingSourceId: string
    subscriptionId: string
    metadata: Record<string, any>
  },
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.BillingRun,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.BillingRunUsageProcessed,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}

export const createBillingRunCreditAppliedLedgerTransaction = async (
  params: {
    livemode: boolean
    organizationId: string
    description: string
    initiatingSourceId: string
    subscriptionId: string
    metadata: Record<string, any>
  },
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.BillingRun,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.BillingRunCreditApplied,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}

export const createAdminCreditAdjustedLedgerTransaction = async (
  params: {
    livemode: boolean
    organizationId: string
    description: string
    initiatingSourceId: string
    subscriptionId: string
    metadata: Record<string, any>
  },
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.Admin,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.AdminCreditAdjusted,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}

export const createCreditGrantExpiredLedgerTransaction = async (
  params: {
    livemode: boolean
    organizationId: string
    description: string
    initiatingSourceId: string
    subscriptionId: string
    metadata: Record<string, any>
  },
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.CreditGrant,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.CreditGrantExpired,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}

export const createPaymentRefundedLedgerTransaction = async (
  params: {
    livemode: boolean
    organizationId: string
    description: string
    initiatingSourceId: string
    subscriptionId: string
    metadata: Record<string, any>
  },
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.Refund,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.PaymentRefunded,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}

export const createBillingRecalculatedLedgerTransaction = async (
  params: {
    livemode: boolean
    organizationId: string
    description: string
    initiatingSourceId: string
    subscriptionId: string
    metadata: Record<string, any>
  },
  transaction: DbTransaction
) => {
  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: params.livemode,
      organizationId: params.organizationId,
      description: params.description,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.BillingRun,
      initiatingSourceId: params.initiatingSourceId,
      subscriptionId: params.subscriptionId,
      type: LedgerTransactionType.BillingRecalculated,
      metadata: params.metadata,
    },
    transaction
  )
  return ledgerTransaction
}
