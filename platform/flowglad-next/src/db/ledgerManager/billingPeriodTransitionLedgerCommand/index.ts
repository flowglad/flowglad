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
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  aggregateAvailableBalanceForUsageCredit,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import {
  findOrCreateLedgerAccountsForSubscriptionAndUsageMeters,
  selectLedgerAccounts,
} from '@/db/tableMethods/ledgerAccountMethods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { UsageCredit } from '@/db/schema/usageCredits'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { processOverageUsageCostCredits } from './processOverageUsageCostCredits'

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
   * First: find or create all the ledger accounts needed to grant the entitlements
   * Second: ...grant the entitlements!
   */
  const entitlementLedgerAccounts =
    await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
      {
        subscriptionId: command.payload.subscription.id,
        usageMeterIds: command.payload.subscriptionFeatureItems.map(
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
