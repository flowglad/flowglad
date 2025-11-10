import { DbTransaction } from '@/db/types'
import {
  BillingPeriodTransitionLedgerCommand,
  LedgerCommandResult,
} from '@/db/ledgerManager/ledgerManagerTypes'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import { selectLedgerTransactions } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  findOrCreateLedgerAccountsForSubscriptionAndUsageMeters,
  selectLedgerAccounts,
} from '@/db/tableMethods/ledgerAccountMethods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { LedgerTransactionType } from '@/types'
import { grantEntitlementUsageCredits } from './grantEntitlementUsageCredits'
import { expireCreditsAtEndOfBillingPeriod } from './expireCreditsAtEndOfBillingPeriod'

export const processBillingPeriodTransitionLedgerCommand = async (
  command: BillingPeriodTransitionLedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const initiatingSourceId =
    command.payload.type === 'standard'
      ? command.payload.newBillingPeriod.id
      : command.payload.subscription.id

  const [transitionForThisBillingPeriod] =
    await selectLedgerTransactions(
      {
        subscriptionId: command.payload.subscription.id,
        type: LedgerTransactionType.BillingPeriodTransition,
        initiatingSourceId: initiatingSourceId,
      },
      transaction
    )

  if (transitionForThisBillingPeriod) {
    throw new Error(
      `There is an existing billing period transition ledger command 
      for subscription ${command.payload.subscription.id}`
    )
  }

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

  const entitlementLedgerAccounts =
    entitlementUsageMeterIds.length > 0
      ? await findOrCreateLedgerAccountsForSubscriptionAndUsageMeters(
          {
            subscriptionId: command.payload.subscription.id,
            usageMeterIds: entitlementUsageMeterIds,
          },
          transaction
        )
      : []

  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    entitlementLedgerAccounts.map((ledgerAccount) => [
      ledgerAccount.usageMeterId!,
      ledgerAccount,
    ])
  )

  const { ledgerEntries: entitlementLedgerEntryRecords } =
    await grantEntitlementUsageCredits(
      {
        ledgerAccountsByUsageMeterId,
        ledgerTransaction,
        command,
      },
      transaction
    )

  /**
   * 3. Expire usage credits at the end of the billing period. This runs *after*
   * usage has been processed to ensure credits are applied before expiring.
   */
  const { ledgerEntries: expirationLedgerEntryRecords } =
    await expireCreditsAtEndOfBillingPeriod(
      {
        ledgerAccountsForSubscription,
        ledgerTransaction,
        command,
      },
      transaction
    )

  return {
    ledgerTransaction,
    ledgerEntries: [
      ...entitlementLedgerEntryRecords,
      ...expirationLedgerEntryRecords,
    ],
  }
}
