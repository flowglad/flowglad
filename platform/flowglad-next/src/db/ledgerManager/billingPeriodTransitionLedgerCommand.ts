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
import { createUsageCreditApplicationsForUsageEvent } from './usageEventProcessedLedgerCommand'
import { UsageCreditApplication } from '../schema/usageCreditApplications'

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
  await bulkInsertLedgerEntries(
    pendingUsageCreditLedgerInserts,
    transaction
  )

  const usageCostsAndUsageCreditByLedgerAccountId: Record<
    string,
    { usageCost: UsageCost.Record; usageCredit: UsageCredit.Record }
  > = {}
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
