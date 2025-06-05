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
    initiatingSourceId: command.payload.billingRunId,
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
   * Expire usage credits at the end of the billing period
   */
  const { ledgerEntries: expirationLedgerEntries } =
    await expireCreditsAtEndOfBillingPeriod(
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

  const { ledgerEntries: entitlementLedgerEntries } =
    await grantEntitlementUsageCredits(
      {
        ledgerAccountsByUsageMeterId,
        ledgerTransaction,
        command,
      },
      transaction
    )

  return {
    ledgerTransaction,
    ledgerEntries: [
      ...entitlementLedgerEntries,
      ...expirationLedgerEntries,
    ],
  }
}
