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
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  aggregateAvailableBalanceForUsageCredit,
  aggregateOutstandingBalanceForUsageCosts,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { selectLedgerAccounts } from '../tableMethods/ledgerAccountMethods'
import { LedgerAccount } from '../schema/ledgerAccounts'
import { UsageCredit } from '../schema/usageCredits'
import { bulkInsertUsageCredits } from '../tableMethods/usageCreditMethods'
import { UsageCreditApplication } from '../schema/usageCreditApplications'
import { bulkInsertUsageCreditApplications } from '../tableMethods/usageCreditApplicationMethods'

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
const processOverageUsageCostCredits = async (
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
  const outstandingUsageCosts =
    await aggregateOutstandingBalanceForUsageCosts(
      {
        ledgerAccountId: ledgerAccountsForSubscription.map(
          (ledgerAccount) => ledgerAccount.id
        ),
      },
      transaction
    )
  const outstandingUsageCostsByLedgerAccountId =
    outstandingUsageCosts.reduce(
      (acc, usageCost) => {
        acc[usageCost.ledgerAccountId] = {
          ledgerAccountId: usageCost.ledgerAccountId,
          usageMeterId: usageCost.usageMeterId,
          subscriptionId: command.subscriptionId!,
          outstandingBalance:
            (acc[usageCost.ledgerAccountId]?.outstandingBalance ||
              0) + usageCost.balance,
        }
        return acc
      },
      {} as {
        [ledgerAccountId: string]: {
          ledgerAccountId: string
          usageMeterId: string
          subscriptionId: string
          outstandingBalance: number
        }
      }
    )

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
  const pendingUsageCreditLedgerInserts: LedgerEntry.CreditGrantRecognizedInsert[] =
    pendingUsageCredits.map((usageCredit) => {
      return {
        ...ledgerEntryNulledSourceIdColumns,
        ledgerTransactionId: ledgerTransaction.id,
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
  const pendingUsageCreditLedgerEntries =
    await bulkInsertLedgerEntries(
      pendingUsageCreditLedgerInserts,
      transaction
    )
  const pendingUsageCreditLedgerEntriesByLedgerAccountId = new Map<
    string,
    LedgerEntry.CreditGrantRecognizedRecord
  >(
    pendingUsageCreditLedgerEntries.map((ledgerEntry) => [
      ledgerEntry.ledgerAccountId,
      ledgerEntry as LedgerEntry.CreditGrantRecognizedRecord,
    ])
  )
  const usageCreditsById = new Map<string, UsageCredit.Record>(
    pendingUsageCredits.map((usageCredit) => [
      usageCredit.id,
      usageCredit,
    ])
  )
  const usageCostsAndUsageCreditByLedgerAccountId: Record<
    string,
    {
      ledgerAccountId: string
      usageEventIds: string[]
      usageCredit: UsageCredit.Record | null
    }
  > = {}
  outstandingUsageCosts.forEach((usageCost) => {
    const ledgerEntry =
      pendingUsageCreditLedgerEntriesByLedgerAccountId.get(
        usageCost.ledgerAccountId
      )
    if (!ledgerEntry) {
      return
    }
    if (
      !usageCostsAndUsageCreditByLedgerAccountId[
        usageCost.ledgerAccountId
      ]
    ) {
      usageCostsAndUsageCreditByLedgerAccountId[
        usageCost.ledgerAccountId
      ] = {
        ledgerAccountId: usageCost.ledgerAccountId,
        usageEventIds: [],
        usageCredit: usageCreditsById.get(
          ledgerEntry.sourceUsageCreditId
        )!,
      }
      return
    }
    usageCostsAndUsageCreditByLedgerAccountId[
      usageCost.ledgerAccountId
    ].usageEventIds.push(usageCost.usageEventId)
  })

  const usageCreditApplicationInserts: UsageCreditApplication.Insert[] =
    Object.values(usageCostsAndUsageCreditByLedgerAccountId).flatMap(
      (item) => {
        const inserts = item.usageEventIds.map((usageEventId) => {
          if (!item.usageCredit) {
            return
          }
          return {
            organizationId: command.organizationId,
            livemode: command.livemode,
            usageCreditId: item.usageCredit.id,
            usageEventId: usageEventId,
            amountApplied: item.usageCredit.issuedAmount,
            appliedAt: new Date(),
            targetUsageMeterId: item.usageCredit.usageMeterId,
            status: UsageCreditApplicationStatus.Pending,
          }
        })
        return inserts.filter((insert) => insert !== undefined)
      }
    )

  const usageCreditApplications =
    await bulkInsertUsageCreditApplications(
      usageCreditApplicationInserts,
      transaction
    )
  const usageCreditApplicationLedgerEntryInserts: (
    | LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert
    | LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert
  )[] = usageCreditApplications.flatMap((usageCreditApplication) => {
    const creditTowardsUsageCostLedgerEntry: LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert =
      {
        ...ledgerEntryNulledSourceIdColumns,
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccountsByUsageMeterId.get(
          usageCreditApplication.targetUsageMeterId!
        )!.id,
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
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccountsByUsageMeterId.get(
          usageCreditApplication.targetUsageMeterId!
        )!.id,
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
  await bulkInsertLedgerEntries(
    usageCreditApplicationLedgerEntryInserts,
    transaction
  )
}

export const grantEntitlementUsageCredits = async (
  params: {
    ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>
    ledgerTransaction: LedgerTransaction.Record
    command: BillingPeriodTransitionLedgerCommand
  },
  transaction: DbTransaction
) => {
  const { ledgerAccountsByUsageMeterId, ledgerTransaction, command } =
    params
  const usageCreditInserts: UsageCredit.Insert[] =
    command.payload.subscriptionFeatureItems.map((featureItem) => {
      return {
        organizationId: command.organizationId,
        livemode: command.livemode,
        amount: featureItem.amount,
        status: UsageCreditStatus.Posted,
        usageMeterId: featureItem.usageMeterId!,
        subscriptionId: command.subscriptionId!,
        notes: null,
        metadata: null,
        expiresAt: command.payload.newBillingPeriod.endDate,
        issuedAmount: featureItem.amount,
        issuedAt: new Date(),
        creditType: UsageCreditType.Grant,
        sourceReferenceType:
          UsageCreditSourceReferenceType.BillingPeriodTransition,
        paymentId: null,
      }
    })

  const usageCredits = await bulkInsertUsageCredits(
    usageCreditInserts,
    transaction
  )

  const entitlementCreditLedgerInserts: LedgerEntry.CreditGrantRecognizedInsert[] =
    usageCredits.map((usageCredit) => {
      const entitlementCreditLedgerEntry: LedgerEntry.CreditGrantRecognizedInsert =
        {
          ...ledgerEntryNulledSourceIdColumns,
          ledgerTransactionId: ledgerTransaction.id,
          ledgerAccountId: ledgerAccountsByUsageMeterId.get(
            usageCredit.usageMeterId
          )!.id,
          subscriptionId: command.subscriptionId!,
          organizationId: command.organizationId,
          status: LedgerEntryStatus.Posted,
          livemode: command.livemode,
          entryTimestamp: new Date(),
          metadata: {},
          amount: usageCredit.issuedAmount,
          direction: LedgerEntryDirection.Credit,
          entryType: LedgerEntryType.CreditGrantRecognized,
          discardedAt: null,
          sourceUsageCreditId: usageCredit.id,
          billingPeriodId: command.payload.newBillingPeriod.id,
        }
      return entitlementCreditLedgerEntry
    })

  await bulkInsertLedgerEntries(
    entitlementCreditLedgerInserts,
    transaction
  )
}

export const expireCreditsAtEndOfBillingPeriod = async (
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
  /**
   * Expire outstanding usage credits for the previous billing period.
   */
  const availableCreditBalancesForLedgerAccounts =
    await aggregateAvailableBalanceForUsageCredit(
      {
        ledgerAccountId: ledgerAccountsForSubscription.map(
          (ledgerAccount) => ledgerAccount.id
        ),
      },
      transaction
    )
  const expiringCreditBalances =
    availableCreditBalancesForLedgerAccounts.filter(
      (balance) => balance.expiresAt !== null
    )
  const creditExpirationLedgerInserts: LedgerEntry.CreditGrantExpiredInsert[] =
    expiringCreditBalances.map((balance) => {
      const creditExpirationLedgerEntry: LedgerEntry.CreditGrantExpiredInsert =
        {
          ...ledgerEntryNulledSourceIdColumns,
          ledgerTransactionId: ledgerTransaction.id,
          ledgerAccountId: balance.ledgerAccountId,
          subscriptionId: command.subscriptionId!,
          organizationId: command.organizationId,
          status: LedgerEntryStatus.Posted,
          livemode: command.livemode,
          entryTimestamp: new Date(),
          direction: LedgerEntryDirection.Debit,
          entryType: LedgerEntryType.CreditGrantExpired,
          amount: balance.balance,
          description: `Credit grant expired for usage credit ${balance.usageCreditId}`,
          metadata: {},
          expiredAt: null,
          discardedAt: null,
          sourceUsageCreditId: balance.usageCreditId,
        }
      return creditExpirationLedgerEntry
    })
  await bulkInsertLedgerEntries(
    creditExpirationLedgerInserts,
    transaction
  )
}

export const processBillingPeriodTransitionLedgerCommand = async (
  command: BillingPeriodTransitionLedgerCommand,
  transaction: DbTransaction
): Promise<void> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: command.payload.billingRunId,
    subscriptionId: command.payload.subscription.id,
  }
  // TODO: Implement LedgerEntry creation for BillingRunUsageProcessed
  const ledgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    transaction
  )
  const ledgerAccountsForSubscription = await selectLedgerAccounts(
    {
      organizationId: command.organizationId,
      livemode: command.livemode,
      subscriptionId: command.payload.subscription.id,
    },
    transaction
  )
  await processOverageUsageCostCredits(
    {
      ledgerAccountsForSubscription,
      ledgerTransaction,
      command,
    },
    transaction
  )
  /**
   * Grant usage credits for the new billing period based on entitlements
   */
  const entitlementLedgerAccounts = await selectLedgerAccounts(
    {
      organizationId: command.organizationId,
      livemode: command.livemode,
      subscriptionId: command.payload.subscription.id,
      usageMeterId: command.payload.subscriptionFeatureItems.map(
        (featureItem) => featureItem.usageMeterId
      ),
    },
    transaction
  )
  const ledgerAccountsWithUsageMeterId =
    entitlementLedgerAccounts.filter(
      (ledgerAccount) => ledgerAccount.usageMeterId !== null
    )
  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    ledgerAccountsWithUsageMeterId.map((ledgerAccount) => [
      ledgerAccount.usageMeterId!,
      ledgerAccount,
    ])
  )
  await grantEntitlementUsageCredits(
    {
      ledgerAccountsByUsageMeterId,
      ledgerTransaction,
      command,
    },
    transaction
  )
}
