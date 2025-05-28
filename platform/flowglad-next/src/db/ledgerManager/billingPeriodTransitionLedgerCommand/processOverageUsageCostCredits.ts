import { DbTransaction } from '@/db/types'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
  UsageCreditApplicationStatus,
} from '@/types'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import {
  aggregateOutstandingBalanceForUsageCosts,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { UsageCredit } from '@/db/schema/usageCredits'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { UsageCreditApplication } from '@/db/schema/usageCreditApplications'
import { bulkInsertUsageCreditApplications } from '@/db/tableMethods/usageCreditApplicationMethods'

export type OutstandingUsageCostAggregation = {
  ledgerAccountId: string
  usageMeterId: string
  subscriptionId: string
  outstandingBalance: number
}

// Helper function to tabulate outstanding usage costs
export const tabulateOutstandingUsageCosts = async (
  ledgerAccountIds: string[],
  subscriptionId: string,
  transaction: DbTransaction
): Promise<{
  outstandingUsageCostsByLedgerAccountId: Map<
    string,
    OutstandingUsageCostAggregation
  >
  rawOutstandingUsageCosts: Awaited<
    ReturnType<typeof aggregateOutstandingBalanceForUsageCosts>
  >
}> => {
  const rawOutstandingUsageCosts =
    await aggregateOutstandingBalanceForUsageCosts(
      {
        ledgerAccountId: ledgerAccountIds,
      },
      transaction
    )

  const outstandingUsageCostsByLedgerAccountId = new Map(
    rawOutstandingUsageCosts.map((usageCost) => [
      usageCost.ledgerAccountId,
      {
        ledgerAccountId: usageCost.ledgerAccountId,
        usageMeterId: usageCost.usageMeterId,
        subscriptionId: subscriptionId,
        outstandingBalance: usageCost.balance,
      },
    ])
  )
  return {
    outstandingUsageCostsByLedgerAccountId,
    rawOutstandingUsageCosts,
  }
}

// Helper function to create pending overage usage credits and their initial ledger entries
const createPendingOverageUsageCreditsAndEntries = async (
  outstandingUsageCostsByLedgerAccountId: Map<
    string,
    OutstandingUsageCostAggregation
  >,
  ledgerTransactionId: string,
  ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>,
  command: BillingPeriodTransitionLedgerCommand,
  transaction: DbTransaction
): Promise<{
  pendingUsageCredits: UsageCredit.Record[]
  pendingUsageCreditLedgerEntryInserts: LedgerEntry.CreditGrantRecognizedInsert[]
}> => {
  const pendingUsageCreditInserts: UsageCredit.Insert[] =
    Object.values(outstandingUsageCostsByLedgerAccountId).map(
      (costItem) => {
        return {
          organizationId: command.organizationId,
          livemode: command.livemode,
          amount: costItem.outstandingBalance,
          status: UsageCreditStatus.Pending,
          usageMeterId: costItem.usageMeterId,
          subscriptionId: command.subscriptionId!,
          notes: null,
          metadata: null,
          expiresAt: null,
          creditType: UsageCreditType.Grant,
          sourceReferenceType:
            UsageCreditSourceReferenceType.BillingPeriodTransition,
          paymentId: command.payload.payment?.id ?? null,
          issuedAmount: costItem.outstandingBalance,
          issuedAt: new Date(),
        }
      }
    )

  const pendingUsageCredits = await bulkInsertUsageCredits(
    pendingUsageCreditInserts,
    transaction
  )

  const pendingUsageCreditLedgerEntryInserts: LedgerEntry.CreditGrantRecognizedInsert[] =
    pendingUsageCredits.map((usageCredit) => {
      return {
        ...ledgerEntryNulledSourceIdColumns,
        ledgerTransactionId: ledgerTransactionId,
        ledgerAccountId: ledgerAccountsByUsageMeterId.get(
          usageCredit.usageMeterId
        )!.id,
        subscriptionId: command.subscriptionId!,
        organizationId: command.organizationId,
        status: LedgerEntryStatus.Pending,
        livemode: command.livemode,
        entryTimestamp: new Date(),
        metadata: {},
        description: `Pending overage credit: ${usageCredit.id}`,
        amount: usageCredit.issuedAmount,
        direction: LedgerEntryDirection.Credit,
        entryType: LedgerEntryType.CreditGrantRecognized,
        discardedAt: null,
        sourceUsageCreditId: usageCredit.id,
      }
    })

  return { pendingUsageCredits, pendingUsageCreditLedgerEntryInserts }
}

type UsageCostsAndUsageCreditByLedgerAccountId = Record<
  string,
  {
    ledgerAccountId: string
    usageEventOutstandingBalances: {
      usageEventId: string
      outstandingBalance: number
    }[]
    usageCredit: UsageCredit.Record
  }
>

// Helper function to prepare data for credit applications
const prepareDataForCreditApplications = (
  rawOutstandingUsageCosts: Awaited<
    ReturnType<typeof aggregateOutstandingBalanceForUsageCosts>
  >,
  pendingUsageCredits: UsageCredit.Record[],
  pendingUsageCreditLedgerEntryInserts: LedgerEntry.CreditGrantRecognizedInsert[]
): UsageCostsAndUsageCreditByLedgerAccountId => {
  const usageCreditsById = new Map<string, UsageCredit.Record>(
    pendingUsageCredits.map((usageCredit) => [
      usageCredit.id,
      usageCredit,
    ])
  )

  const usageCreditsByLedgerAccountId = new Map<
    string,
    UsageCredit.Record
  >(
    pendingUsageCreditLedgerEntryInserts.map((ledgerEntry) => [
      ledgerEntry.ledgerAccountId,
      usageCreditsById.get(ledgerEntry.sourceUsageCreditId)!,
    ])
  )

  const result: UsageCostsAndUsageCreditByLedgerAccountId = {}
  rawOutstandingUsageCosts.forEach((usageCost) => {
    if (!result[usageCost.ledgerAccountId]) {
      const creditForAccount = usageCreditsByLedgerAccountId.get(
        usageCost.ledgerAccountId
      )
      if (!creditForAccount) {
        // This case should ideally not happen if logic is correct upstream
        // Consider logging or throwing an error if critical
        console.warn(
          `No usage credit found for ledger account ID: ${usageCost.ledgerAccountId} during overage processing.`
        )
        return // Skip this usage cost if no credit is associated
      }
      result[usageCost.ledgerAccountId] = {
        ledgerAccountId: usageCost.ledgerAccountId,
        usageEventOutstandingBalances: [],
        usageCredit: creditForAccount,
      }
    }
    result[
      usageCost.ledgerAccountId
    ].usageEventOutstandingBalances.push({
      usageEventId: usageCost.usageEventId,
      outstandingBalance: usageCost.balance,
    })
  })
  return result
}

// Helper function to create pending usage credit applications
export const createPendingUsageCreditApplications = async (
  usageCostsAndUsageCreditByLedgerAccountId: UsageCostsAndUsageCreditByLedgerAccountId,
  command: BillingPeriodTransitionLedgerCommand,
  transaction: DbTransaction
): Promise<UsageCreditApplication.Record[]> => {
  const usageCreditApplicationInserts: UsageCreditApplication.Insert[] =
    Object.values(usageCostsAndUsageCreditByLedgerAccountId).flatMap(
      (item) => {
        // item.usageCredit can be null if the check in prepareDataForCreditApplications leads to an early return for a specific ledger account.
        // However, given the current structure, if an entry exists in usageCostsAndUsageCreditByLedgerAccountId, item.usageCredit should be defined.
        // Adding a check for robustness.
        if (!item.usageCredit) {
          return [] // Should not happen if data preparation is correct
        }
        return item.usageEventOutstandingBalances.map(
          (usageEventOutstandingBalance) => {
            return {
              organizationId: command.organizationId,
              livemode: command.livemode,
              usageCreditId: item.usageCredit.id,
              usageEventId: usageEventOutstandingBalance.usageEventId,
              amountApplied:
                usageEventOutstandingBalance.outstandingBalance,
              appliedAt: new Date(),
              targetUsageMeterId: item.usageCredit.usageMeterId,
              status: UsageCreditApplicationStatus.Pending,
            }
          }
        )
      }
    )

  return bulkInsertUsageCreditApplications(
    usageCreditApplicationInserts.filter(
      (insert): insert is UsageCreditApplication.Insert =>
        insert !== undefined
    ), // Ensure no undefined entries
    transaction
  )
}

// Helper function to create ledger entries for credit applications
export const createLedgerEntriesForApplications = (
  usageCreditApplications: UsageCreditApplication.Record[],
  ledgerTransactionId: string,
  ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>,
  command: BillingPeriodTransitionLedgerCommand
): (
  | LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert
  | LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert
)[] => {
  return usageCreditApplications.flatMap((usageCreditApplication) => {
    const ledgerAccountId = ledgerAccountsByUsageMeterId.get(
      usageCreditApplication.targetUsageMeterId!
    )!.id

    const creditTowardsUsageCostLedgerEntry: LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert =
      {
        ...ledgerEntryNulledSourceIdColumns,
        ledgerTransactionId: ledgerTransactionId,
        ledgerAccountId: ledgerAccountId, // This should be the usage cost's LA, which is the same LA as the credit grant for overages
        subscriptionId: command.subscriptionId!,
        organizationId: command.organizationId,
        status: LedgerEntryStatus.Pending,
        livemode: command.livemode,
        entryTimestamp: new Date(),
        metadata: {},
        direction: LedgerEntryDirection.Credit,
        entryType:
          LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
        discardedAt: null,
        sourceCreditApplicationId: usageCreditApplication.id,
        calculationRunId: null,
        amount: usageCreditApplication.amountApplied,
        description: `Usage credit application credit towards usage cost: ${usageCreditApplication.id}`,
        sourceUsageEventId: usageCreditApplication.usageEventId,
        sourceUsageCreditId: usageCreditApplication.usageCreditId,
      }

    const debitFromCreditBalanceLedgerEntry: LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert =
      {
        ...ledgerEntryNulledSourceIdColumns,
        ledgerTransactionId: ledgerTransactionId,
        ledgerAccountId: ledgerAccountId, // This is the credit grant's LA
        subscriptionId: command.subscriptionId!,
        organizationId: command.organizationId,
        status: LedgerEntryStatus.Pending,
        livemode: command.livemode,
        entryTimestamp: new Date(),
        metadata: {},
        direction: LedgerEntryDirection.Debit,
        entryType:
          LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
        discardedAt: null,
        sourceCreditApplicationId: usageCreditApplication.id,
        calculationRunId: null,
        amount: usageCreditApplication.amountApplied,
        description: `Usage credit application debit from credit balance: ${usageCreditApplication.id}`,
        sourceUsageEventId: usageCreditApplication.usageEventId,
        sourceUsageCreditId: usageCreditApplication.usageCreditId,
      }
    return [
      creditTowardsUsageCostLedgerEntry,
      debitFromCreditBalanceLedgerEntry,
    ]
  })
}

/**
 * This code should:
 * 1. Tabulate, for all of the ledger accounts in the subscription, the outstanding usage costs
 * 2. For each ledger account, create a pending usage credit for the outstanding usage costs
 * 3. For each outstanding usage cost, create a pending usage credit application connecting the
 *    credit with that cost (one per account, many costs)
 * 4. For each outstanding usage cost, create a pending usage credit application debit from the
 *    credit balance (one per account, many costs)
 * 5. For each outstanding usage cost, create a pending usage credit application credit towards
 *    the usage cost (one per account, many costs)
 * @param params
 * @param transaction
 */
export const processOverageUsageCostCredits = async (
  params: {
    ledgerAccountsForSubscription: LedgerAccount.Record[]
    ledgerTransaction: LedgerTransaction.Record
    command: BillingPeriodTransitionLedgerCommand
  },
  transaction: DbTransaction
) => {
  const {
    ledgerAccountsForSubscription,
    ledgerTransaction,
    command,
  } = params

  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    ledgerAccountsForSubscription.map((ledgerAccount) => [
      ledgerAccount.usageMeterId!,
      ledgerAccount,
    ])
  )

  const {
    outstandingUsageCostsByLedgerAccountId,
    rawOutstandingUsageCosts,
  } = await tabulateOutstandingUsageCosts(
    ledgerAccountsForSubscription.map((la) => la.id),
    command.subscriptionId!,
    transaction
  )

  const {
    pendingUsageCredits,
    pendingUsageCreditLedgerEntryInserts,
  } = await createPendingOverageUsageCreditsAndEntries(
    outstandingUsageCostsByLedgerAccountId,
    ledgerTransaction.id,
    ledgerAccountsByUsageMeterId,
    command,
    transaction
  )

  const usageCostsAndUsageCreditByLedgerAccountId =
    prepareDataForCreditApplications(
      rawOutstandingUsageCosts,
      pendingUsageCredits,
      pendingUsageCreditLedgerEntryInserts
    )

  const usageCreditApplications =
    await createPendingUsageCreditApplications(
      usageCostsAndUsageCreditByLedgerAccountId,
      command,
      transaction
    )

  const usageCreditApplicationLedgerEntryInserts =
    createLedgerEntriesForApplications(
      usageCreditApplications,
      ledgerTransaction.id,
      ledgerAccountsByUsageMeterId,
      command
    )

  await bulkInsertLedgerEntries(
    [
      ...pendingUsageCreditLedgerEntryInserts,
      ...usageCreditApplicationLedgerEntryInserts,
    ],
    transaction
  )
}
