import { Result } from 'better-result'
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
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import type { DbTransaction } from '@/db/types'
import { NotFoundError } from '@/errors'
import {
  FeatureUsageGrantFrequency,
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'

interface GrantEntitlementUsageCreditsResult {
  usageCredits: UsageCredit.Record[]
  ledgerEntries: LedgerEntry.CreditGrantRecognizedRecord[]
}

export const grantEntitlementUsageCredits = async (
  params: {
    ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>
    ledgerTransaction: LedgerTransaction.Record
    command: BillingPeriodTransitionLedgerCommand
  },
  transaction: DbTransaction
): Promise<
  Result<GrantEntitlementUsageCreditsResult, NotFoundError>
> => {
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
      return {
        organizationId: command.organizationId,
        livemode: command.livemode,
        amount: featureItem.amount,
        status: UsageCreditStatus.Posted,
        usageMeterId: featureItem.usageMeterId!,
        subscriptionId: command.subscriptionId!,
        billingPeriodId:
          standardPayload.type === 'standard'
            ? standardPayload.newBillingPeriod?.id
            : null,
        notes: null,
        metadata: null,
        // Credits from recurring grants expire at the end of the billing period.
        // Credits from one-time grants are evergreen and do not expire.
        expiresAt:
          featureItem.renewalFrequency ===
          FeatureUsageGrantFrequency.EveryBillingPeriod
            ? standardPayload.type === 'standard'
              ? standardPayload.newBillingPeriod.endDate
              : null
            : null,
        issuedAmount: featureItem.amount,
        issuedAt: Date.now(),
        creditType: UsageCreditType.Grant,
        sourceReferenceType:
          UsageCreditSourceReferenceType.BillingPeriodTransition,
        paymentId: null,
      }
    })

  if (usageCreditInserts.length === 0) {
    return Result.ok({
      usageCredits: [],
      ledgerEntries: [],
    })
  }

  const usageCreditsResult = await bulkInsertUsageCredits(
    usageCreditInserts,
    transaction
  )
  if (Result.isError(usageCreditsResult)) {
    return Result.err(usageCreditsResult.error)
  }
  const usageCredits = usageCreditsResult.value
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

  const entitlementCreditLedgerEntriesResult =
    await bulkInsertLedgerEntries(
      entitlementCreditLedgerInserts,
      transaction
    )
  if (Result.isError(entitlementCreditLedgerEntriesResult)) {
    return Result.err(entitlementCreditLedgerEntriesResult.error)
  }
  return Result.ok({
    usageCredits,
    ledgerEntries:
      entitlementCreditLedgerEntriesResult.value as LedgerEntry.CreditGrantRecognizedRecord[],
  })
}
