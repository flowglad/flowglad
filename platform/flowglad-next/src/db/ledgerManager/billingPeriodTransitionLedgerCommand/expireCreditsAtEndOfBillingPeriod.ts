import { Result } from 'better-result'
import type {
  BillingPeriodTransitionLedgerCommand,
  StandardBillingPeriodTransitionPayload,
} from '@/db/ledgerManager/ledgerManagerTypes'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  aggregateAvailableBalanceForUsageCredit,
  bulkInsertLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import type { DbTransaction } from '@/db/types'
import { NotFoundError } from '@/errors'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
} from '@/types'
import { nowTime } from '@/utils/core'

interface ExpireCreditsResult {
  ledgerTransaction: LedgerTransaction.Record
  ledgerEntries: LedgerEntry.Record[]
}

export const expireCreditsAtEndOfBillingPeriod = async (
  params: {
    ledgerAccountsForSubscription: LedgerAccount.Record[]
    ledgerTransaction: LedgerTransaction.Record
    command: BillingPeriodTransitionLedgerCommand
  },
  transaction: DbTransaction
): Promise<Result<ExpireCreditsResult, NotFoundError>> => {
  const {
    ledgerAccountsForSubscription,
    ledgerTransaction,
    command,
  } = params

  // Non-renewing subscriptions don't have billing periods and their credits never expire
  if (command.payload.type === 'non_renewing') {
    return Result.ok({
      ledgerTransaction,
      ledgerEntries: [],
    })
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
  const entriesResult = await bulkInsertLedgerEntries(
    creditExpirationLedgerInserts,
    transaction
  )
  if (Result.isError(entriesResult)) {
    return Result.err(entriesResult.error)
  }
  return Result.ok({
    ledgerTransaction,
    ledgerEntries: entriesResult.value,
  })
}
