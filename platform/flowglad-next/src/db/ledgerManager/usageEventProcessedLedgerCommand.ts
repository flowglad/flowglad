import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  UsageCreditApplicationStatus,
} from '@db-core/enums'
import type { LedgerAccount } from '@db-core/schema/ledgerAccounts'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@db-core/schema/ledgerEntries'
import type { LedgerTransaction } from '@db-core/schema/ledgerTransactions'
import type { UsageCreditApplication } from '@db-core/schema/usageCreditApplications'
import type { UsageEvent } from '@db-core/schema/usageEvents'
import { Result } from 'better-result'
import type {
  LedgerCommandResult,
  UsageEventProcessedLedgerCommand,
} from '@/db/ledgerManager/ledgerManagerTypes'
import { findOrCreateLedgerAccountsForSubscriptionAndUsageMeters } from '@/db/tableMethods/ledgerAccountMethods'
import {
  aggregateAvailableBalanceForUsageCredit,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import { bulkInsertUsageCreditApplications } from '@/db/tableMethods/usageCreditApplicationMethods'
import type { DbTransaction } from '@/db/types'
import { NotFoundError, panic } from '@/errors'
import { LedgerTransactionInitiatingSourceType } from '@/types'

export const createUsageCreditApplicationsForUsageEvent = async (
  params: {
    organizationId: string
    usageEvent: UsageEvent.Record
    availableCreditBalances: {
      usageCreditId: string
      balance: number
    }[]
  },
  transaction: DbTransaction
): Promise<UsageCreditApplication.Record[]> => {
  const { organizationId, usageEvent, availableCreditBalances } =
    params
  if (availableCreditBalances.length === 0) {
    return []
  }

  let outstandingBalance = usageEvent.amount
  const applications: UsageCreditApplication.Insert[] = []

  for (const creditBalance of availableCreditBalances) {
    if (creditBalance.balance === 0) {
      continue
    }

    const applicationAmount = Math.min(
      creditBalance.balance,
      outstandingBalance
    )

    applications.push({
      organizationId,
      livemode: usageEvent.livemode,
      amountApplied: applicationAmount,
      appliedAt: Date.now(),
      targetUsageMeterId: usageEvent.usageMeterId,
      usageCreditId: creditBalance.usageCreditId,
      usageEventId: usageEvent.id,
      status: UsageCreditApplicationStatus.Posted,
    })

    outstandingBalance -= applicationAmount

    if (outstandingBalance === 0) {
      break
    }
  }

  return await bulkInsertUsageCreditApplications(
    applications,
    transaction
  )
}

export const createLedgerEntryInsertsForUsageCreditApplications =
  (params: {
    usageCreditApplications: UsageCreditApplication.Record[]
    ledgerAccount: LedgerAccount.Record
    ledgerTransaction: LedgerTransaction.Record
  }): LedgerEntry.Insert[] => {
    const {
      usageCreditApplications,
      ledgerAccount,
      ledgerTransaction,
    } = params
    const ledgerEntryInserts: LedgerEntry.Insert[] =
      usageCreditApplications.flatMap((application) => {
        // Create debit entry from credit balance
        const debitEntry: LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert =
          {
            ...ledgerEntryNulledSourceIdColumns,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: ledgerTransaction.id,
            subscriptionId: ledgerAccount.subscriptionId,
            entryTimestamp: application.appliedAt,
            status: LedgerEntryStatus.Posted,
            direction: LedgerEntryDirection.Debit,
            entryType:
              LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
            amount: application.amountApplied,
            description: `Debit from credit balance for usage credit application ${application.id}`,
            sourceCreditApplicationId: application.id,
            organizationId: application.organizationId,
            livemode: application.livemode,
            metadata: null,
            discardedAt: null,
            sourceUsageEventId: application.usageEventId!,
            sourceUsageCreditId: application.usageCreditId,
          }

        // Create credit entry towards usage cost
        const creditEntry: LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert =
          {
            ...ledgerEntryNulledSourceIdColumns,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: ledgerTransaction.id,
            subscriptionId: ledgerAccount.subscriptionId,
            entryTimestamp: application.appliedAt,
            status: LedgerEntryStatus.Posted,
            direction: LedgerEntryDirection.Credit,
            entryType:
              LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
            amount: application.amountApplied,
            description: `Credit towards usage cost for usage credit application ${application.id}`,
            sourceCreditApplicationId: application.id,
            organizationId: application.organizationId,
            livemode: application.livemode,
            metadata: null,
            discardedAt: null,
            sourceUsageEventId: application.usageEventId!,
            sourceUsageCreditId: application.usageCreditId,
          }

        return [debitEntry, creditEntry]
      })

    return ledgerEntryInserts
  }

export const processUsageEventProcessedLedgerCommand = async (
  command: UsageEventProcessedLedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType:
      LedgerTransactionInitiatingSourceType.UsageEvent,
    initiatingSourceId: command.payload.usageEvent.id,
    subscriptionId: command.subscriptionId!,
  }
  let ledgerTransaction: LedgerTransaction.Record
  try {
    ledgerTransaction = await insertLedgerTransaction(
      ledgerTransactionInput,
      transaction
    )
  } catch (error) {
    // If subscription not found, convert to Result error
    if (
      error instanceof Error &&
      error.message.includes('No subscriptions found')
    ) {
      return Result.err(
        new NotFoundError('subscriptions', command.subscriptionId!)
      )
    }
    panic(
      `Unexpected error inserting ledger transaction: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const ledgerAccountsResult =
    await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
      {
        subscriptionId: command.subscriptionId!,
        usageMeterIds: [command.payload.usageEvent.usageMeterId],
      },
      transaction
    )
  if (Result.isError(ledgerAccountsResult)) {
    const err = ledgerAccountsResult.error
    return Result.err(
      new NotFoundError(err.resourceType, String(err.resourceId))
    )
  }
  const [ledgerAccount] = ledgerAccountsResult.unwrap()
  if (!ledgerAccount) {
    panic(
      'Failed to select ledger account for UsageEventProcessed command'
    )
  }
  const availableCreditBalances =
    await aggregateAvailableBalanceForUsageCredit(
      {
        ledgerAccountId: ledgerAccount.id,
      },
      transaction
    )
  const usageCreditApplications =
    await createUsageCreditApplicationsForUsageEvent(
      {
        organizationId: command.organizationId,
        usageEvent: command.payload.usageEvent,
        availableCreditBalances,
      },
      transaction
    )
  const usageCostLedgerEntry: LedgerEntry.Insert = {
    ...ledgerEntryNulledSourceIdColumns,
    ledgerTransactionId: ledgerTransaction.id,
    ledgerAccountId: ledgerAccount.id,
    subscriptionId: command.subscriptionId!,
    organizationId: command.organizationId,
    livemode: command.livemode,
    entryTimestamp: Date.now(),
    status: LedgerEntryStatus.Posted,
    discardedAt: null,
    direction: LedgerEntryDirection.Debit,
    entryType: LedgerEntryType.UsageCost,
    amount: command.payload.usageEvent.amount,
    description: `Usage event ${command.payload.usageEvent.id} processed.`,
    sourceUsageEventId: command.payload.usageEvent.id,
    billingPeriodId:
      command.payload.usageEvent.billingPeriodId ?? null,
    usageMeterId: command.payload.usageEvent.usageMeterId ?? null,
    metadata: null,
  }
  const creditApplicationLedgerEntries: LedgerEntry.Insert[] =
    createLedgerEntryInsertsForUsageCreditApplications({
      usageCreditApplications,
      ledgerAccount,
      ledgerTransaction,
    })
  const ledgerEntryInserts = [
    usageCostLedgerEntry,
    ...creditApplicationLedgerEntries,
  ]
  const createdLedgerEntriesResult = await bulkInsertLedgerEntries(
    ledgerEntryInserts,
    transaction
  )
  if (Result.isError(createdLedgerEntriesResult)) {
    return Result.err(createdLedgerEntriesResult.error)
  }
  return Result.ok({
    ledgerTransaction,
    ledgerEntries: createdLedgerEntriesResult.value,
  })
}
