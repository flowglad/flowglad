import { DbTransaction } from '@/db/types'
import {
  BillingPeriodTransitionLedgerCommand,
  LedgerCommandResult,
} from '@/db/ledgerManager/ledgerManagerTypes'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import {
  findOrCreateLedgerAccountsForSubscriptionAndUsageMeters,
  selectLedgerAccounts,
} from '@/db/tableMethods/ledgerAccountMethods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { grantEntitlementUsageCredits } from './grantEntitlementUsageCredits'
import { expireCreditsAtEndOfBillingPeriod } from './expireCreditsAtEndOfBillingPeriod'

export const processBillingPeriodTransitionLedgerCommand = async (
  command: BillingPeriodTransitionLedgerCommand,
  transaction: DbTransaction
): Promise<LedgerCommandResult> => {
  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: command.organizationId,
    livemode: command.livemode,
    type: command.type,
    description: command.transactionDescription ?? null,
    metadata: command.transactionMetadata ?? null,
    initiatingSourceType: command.type,
    initiatingSourceId: 'billing_period_transition',
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

  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    entitlementLedgerAccounts.map((ledgerAccount) => [
      ledgerAccount.usageMeterId!,
      ledgerAccount,
    ])
  )

  const allMetersHaveAccount =
    command.payload.subscriptionFeatureItems.every((featureItem) =>
      ledgerAccountsByUsageMeterId.has(featureItem.usageMeterId)
    )

  if (!allMetersHaveAccount) {
    const missingMeters = command.payload.subscriptionFeatureItems
      .filter(
        (featureItem) =>
          !ledgerAccountsByUsageMeterId.has(featureItem.usageMeterId)
      )
      .map((featureItem) => featureItem.usageMeterId)
    throw new Error(
      `Could not find or create a ledger account for all entitled usage meters. Missing: ${missingMeters.join(
        ', '
      )}`
    )
  }

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
