import {
  type BillingPeriodTransitionLedgerCommand,
  StandardBillingPeriodTransitionPayload,
} from '@/db/ledgerManager/ledgerManagerTypes'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import type { UsageCredit } from '@/db/schema/usageCredits'
import { findOrCreateLedgerAccountsForSubscriptionAndUsageMeters } from '@/db/tableMethods/ledgerAccountMethods'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { bulkInsertOrDoNothingUsageCreditsBySourceReferenceAndBillingPeriod } from '@/db/tableMethods/usageCreditMethods'
import type { DbTransaction } from '@/db/types'
import {
  FeatureUsageGrantFrequency,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'

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
  const standardPayload = command.payload
  const isInitialGrant =
    standardPayload.type === 'non_renewing' ||
    !standardPayload.previousBillingPeriod

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
  /**
   * Create usage credit inserts from the already-filtered feature items
   */
  const usageCreditInserts: UsageCredit.Insert[] =
    featureItemsToGrant.map((featureItem) => {
      const billingPeriodId =
        standardPayload.type === 'standard'
          ? standardPayload.newBillingPeriod.id
          : null
      let expiresAt: number | null = null
      if (
        featureItem.renewalFrequency ===
          FeatureUsageGrantFrequency.EveryBillingPeriod &&
        standardPayload.type === 'standard'
      ) {
        expiresAt = standardPayload.newBillingPeriod.endDate
      }
      return {
        organizationId: command.organizationId,
        livemode: command.livemode,
        amount: featureItem.amount,
        status: UsageCreditStatus.Posted,
        usageMeterId: featureItem.usageMeterId!,
        subscriptionId: command.subscriptionId!,
        billingPeriodId,
        notes: null,
        metadata: null,
        // Credits from recurring grants expire at the end of the billing period.
        // Credits from one-time grants are evergreen and do not expire.
        expiresAt,
        issuedAmount: featureItem.amount,
        issuedAt: Date.now(),
        creditType: UsageCreditType.Grant,
        sourceReferenceType:
          UsageCreditSourceReferenceType.BillingPeriodTransition,
        /**
         * For BillingPeriodTransition, we can create multiple credits (one per feature item).
         * This must be non-null + stable so we can safely de-dupe on retries via the unique index:
         * (source_reference_id, source_reference_type, billing_period_id).
         */
        sourceReferenceId: featureItem.id,
        paymentId: null,
      }
    })

  if (usageCreditInserts.length === 0) {
    return {
      usageCredits: [],
      ledgerEntries: [],
    }
  }

  const usageCredits =
    await bulkInsertOrDoNothingUsageCreditsBySourceReferenceAndBillingPeriod(
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
          entryTimestamp: Date.now(),
          metadata: {},
          amount: usageCredit.issuedAmount,
          direction: LedgerEntryDirection.Credit,
          entryType: LedgerEntryType.CreditGrantRecognized,
          discardedAt: null,
          sourceUsageCreditId: usageCredit.id,
          usageMeterId: usageCredit.usageMeterId,
          billingPeriodId:
            command.payload.type === 'standard'
              ? command.payload.newBillingPeriod.id
              : null,
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
