import { DbTransaction } from '@/db/types'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
} from '@/types'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { UsageCredit } from '@/db/schema/usageCredits'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { findOrCreateLedgerAccountsForSubscriptionAndUsageMeters } from '@/db/tableMethods/ledgerAccountMethods'

export const grantEntitlementUsageCredits = async (
  params: {
    ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>
    ledgerTransaction: LedgerTransaction.Record
    command: BillingPeriodTransitionLedgerCommand
  },
  transaction: DbTransaction
): Promise<{
  usageCredits: UsageCredit.Record[]
  ledgerEntries: LedgerEntry.CreditGrantRecognizedRecord[]
}> => {
  const { ledgerAccountsByUsageMeterId, ledgerTransaction, command } =
    params
  const subscriptionFeatureItemsWithUsageMeters =
    command.payload.subscriptionFeatureItems.filter(
      (featureItem) => featureItem.usageMeterId
    )
  const usageMetersWithoutLedgerAccounts =
    subscriptionFeatureItemsWithUsageMeters.filter(
      (featureItem) =>
        !ledgerAccountsByUsageMeterId.has(featureItem.usageMeterId!)
    )
  if (usageMetersWithoutLedgerAccounts.length > 0) {
    const newlyCreatedLedgerAccounts =
      await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
        {
          subscriptionId: command.subscriptionId!,
          usageMeterIds: usageMetersWithoutLedgerAccounts.map(
            (featureItem) => featureItem.usageMeterId!
          ),
        },
        transaction
      )
    newlyCreatedLedgerAccounts.forEach((ledgerAccount) => {
      ledgerAccountsByUsageMeterId.set(
        ledgerAccount.usageMeterId!,
        ledgerAccount
      )
    })
  }

  const usageCreditInserts: UsageCredit.Insert[] =
    subscriptionFeatureItemsWithUsageMeters.map((featureItem) => {
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
          claimedByBillingRunId: null,
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

  const entitlementCreditLedgerEntries =
    await bulkInsertLedgerEntries(
      entitlementCreditLedgerInserts,
      transaction
    )
  return {
    usageCredits,
    ledgerEntries:
      entitlementCreditLedgerEntries as LedgerEntry.CreditGrantRecognizedRecord[],
  }
}
