import { LedgerTransactionType } from '@db-core/enums'
import type { LedgerAccount } from '@db-core/schema/ledgerAccounts'
import type { LedgerTransaction } from '@db-core/schema/ledgerTransactions'
import { Result } from 'better-result'
import type {
  BillingPeriodTransitionLedgerCommand,
  LedgerCommandResult,
} from '@/db/ledgerManager/ledgerManagerTypes'
import {
  findOrCreateLedgerAccountsForSubscriptionAndUsageMeters,
  selectLedgerAccounts,
} from '@/db/tableMethods/ledgerAccountMethods'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import {
  insertLedgerTransaction,
  selectLedgerTransactions,
} from '@/db/tableMethods/ledgerTransactionMethods'
import type { DbTransaction } from '@/db/types'
import { NotFoundError } from '@/errors'
import { expireCreditsAtEndOfBillingPeriod } from './expireCreditsAtEndOfBillingPeriod'
import { grantEntitlementUsageCredits } from './grantEntitlementUsageCredits'

export const processBillingPeriodTransitionLedgerCommand = async (
  command: BillingPeriodTransitionLedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
  const initiatingSourceId =
    command.payload.type === 'standard'
      ? command.payload.newBillingPeriod.id
      : command.payload.subscription.id

  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId,
    subscriptionId: command.payload.subscription.id,
  }

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
   * 2. Grant usage credits for the new billing period based on entitlements
   * First: find or create all the ledger accounts needed to grant the entitlements
   * Second: ...grant the entitlements!
   */
  const entitlementUsageMeterIds = [
    ...new Set(
      command.payload.subscriptionFeatureItems
        .map((featureItem) => featureItem.usageMeterId)
        .filter((id): id is string => !!id)
    ),
  ]

  const entitlementLedgerAccountsResult =
    entitlementUsageMeterIds.length > 0
      ? await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
          {
            subscriptionId: command.payload.subscription.id,
            usageMeterIds: entitlementUsageMeterIds,
          },
          transaction
        )
      : Result.ok([])
  // If subscription doesn't exist, throw (shouldn't happen during billing period transition)
  const entitlementLedgerAccounts =
    entitlementLedgerAccountsResult.unwrap()

  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    entitlementLedgerAccounts.map((ledgerAccount) => [
      ledgerAccount.usageMeterId!,
      ledgerAccount,
    ])
  )

  const entitlementResult = await grantEntitlementUsageCredits(
    {
      ledgerAccountsByUsageMeterId,
      ledgerTransaction,
      command,
    },
    transaction
  )
  if (Result.isError(entitlementResult)) {
    return Result.err(entitlementResult.error)
  }
  const entitlementLedgerEntryRecords =
    entitlementResult.value.ledgerEntries

  /**
   * 3. Expire usage credits at the end of the billing period. This runs *after*
   * usage has been processed to ensure credits are applied before expiring.
   */
  const expirationResult = await expireCreditsAtEndOfBillingPeriod(
    {
      ledgerAccountsForSubscription,
      ledgerTransaction,
      command,
    },
    transaction
  )
  if (Result.isError(expirationResult)) {
    return Result.err(expirationResult.error)
  }
  const expirationLedgerEntryRecords =
    expirationResult.value.ledgerEntries

  return Result.ok({
    ledgerTransaction,
    ledgerEntries: [
      ...entitlementLedgerEntryRecords,
      ...expirationLedgerEntryRecords,
    ],
  })
}
