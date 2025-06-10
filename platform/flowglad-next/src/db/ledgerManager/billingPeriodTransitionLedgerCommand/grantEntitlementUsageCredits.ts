import { DbTransaction } from '@/db/types'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
  FeatureUsageGrantFrequency,
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

  const isInitialGrant =
    command.payload.previousBillingPeriod === null

  const featureItemsToGrant = isInitialGrant
    ? subscriptionFeatureItemsWithUsageMeters
    : subscriptionFeatureItemsWithUsageMeters.filter(
        (featureItem) =>
          featureItem.renewalFrequency ===
          FeatureUsageGrantFrequency.EveryBillingPeriod
      )

  const usageMetersWithoutLedgerAccounts = featureItemsToGrant.filter(
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
    featureItemsToGrant.map((featureItem) => {
      return {
        organizationId: command.organizationId,
        livemode: command.livemode,
        amount: featureItem.amount,
        status: UsageCreditStatus.Posted,
        usageMeterId: featureItem.usageMeterId!,
        subscriptionId: command.subscriptionId!,
        billingPeriodId: command.payload.newBillingPeriod.id,
        notes: null,
        metadata: null,
        // Credits from recurring grants expire at the end of the billing period.
        // Credits from one-time grants are evergreen and do not expire.
        expiresAt:
          featureItem.renewalFrequency ===
          FeatureUsageGrantFrequency.EveryBillingPeriod
            ? command.payload.newBillingPeriod.endDate
            : null,
        issuedAmount: featureItem.amount,
        issuedAt: new Date(),
        creditType: UsageCreditType.Grant,
        sourceReferenceType:
          UsageCreditSourceReferenceType.BillingPeriodTransition,
        paymentId: null,
      }
    })

  if (usageCreditInserts.length === 0) {
    return {
      usageCredits: [],
      ledgerEntries: [],
    }
  }

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
