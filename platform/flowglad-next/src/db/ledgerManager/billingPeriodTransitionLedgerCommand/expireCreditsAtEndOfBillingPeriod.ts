import { DbTransaction } from '@/db/types'
import {
  BillingPeriodTransitionLedgerCommand,
  StandardBillingPeriodTransitionPayload,
} from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
} from '@/types'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import {
  aggregateAvailableBalanceForUsageCredit,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { nowTime } from '@/utils/core'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'

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

  // Non-renewing subscriptions don't have billing periods and their credits never expire
  if (command.payload.type === 'non_renewing') {
    return {
      ledgerTransaction,
      ledgerEntries: [],
    }
  }

  const standardPayload =
    command.payload as StandardBillingPeriodTransitionPayload
  const newBillingPeriod = standardPayload.newBillingPeriod
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
      transaction,
      standardPayload.previousBillingPeriod?.endDate
        ? new Date(standardPayload.previousBillingPeriod.endDate)
        : undefined
    )
  const expiringCreditBalances =
    availableCreditBalancesForLedgerAccounts.filter(
      (balance) =>
        balance.balance > 0 &&
        balance.expiresAt !== null &&
        new Date(balance.expiresAt) <=
          new Date(newBillingPeriod.startDate)
    )
  const creditExpirationLedgerInserts: LedgerEntry.CreditGrantExpiredInsert[] =
    expiringCreditBalances.map((balance) => {
      const creditExpirationLedgerEntry: LedgerEntry.CreditGrantExpiredInsert =
        {
          ...ledgerEntryNulledSourceIdColumns,
          claimedByBillingRunId: null,
          ledgerTransactionId: ledgerTransaction.id,
          ledgerAccountId: balance.ledgerAccountId,
          subscriptionId: command.subscriptionId!,
          organizationId: command.organizationId,
          status: LedgerEntryStatus.Posted,
          livemode: command.livemode,
          entryTimestamp: Date.now(),
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
  const entries = await bulkInsertLedgerEntries(
    creditExpirationLedgerInserts,
    transaction
  )
  return {
    ledgerTransaction,
    ledgerEntries: entries,
  }
}
