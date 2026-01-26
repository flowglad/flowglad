/**
 * This command handles the entire accounting process for settling a paid invoice's
 * usage costs. It's designed to be an atomic, idempotent operation that takes a
 * paid invoice and ensures all associated usage debts on the ledger are cleared.
 *
 * The process is as follows:
 * 1. A single parent `LedgerTransaction` is created to bundle all accounting entries for this settlement.
 * 2. For each usage-based line item on the invoice, a `UsageCredit` grant is created. The value of this grant
 *    matches the amount paid for that line item, and the grant is sourced from the paid invoice.
 * 3. A `credit_grant_recognized` ledger entry is created for each new `UsageCredit` grant, officially posting
 *    the credit value to the corresponding ledger account.
 * 4. The command finds all `usage_cost` ledger entries that were part of the invoice's original billing run.
 * 5. It then creates `UsageCreditApplication` records to apply the new settlement credits against each of these outstanding usage costs.
 * 6. Finally, for each `UsageCreditApplication`, it creates a pair of ledger entries:
 *    - A `debit` from the credit balance (`UsageCreditApplicationDebitFromCreditBalance`).
 *    - A `credit` towards the usage cost (`UsageCreditApplicationCreditTowardsUsageCost`).
 * This final step zeroes out the usage debt for the period, completing the settlement.
 */

import { Result } from 'better-result'
import type {
  LedgerCommandResult,
  SettleInvoiceUsageCostsLedgerCommand,
} from '@/db/ledgerManager/ledgerManagerTypes'
import type { Invoice } from '@/db/schema/invoices'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import {
  type LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
  usageCostSelectSchema,
} from '@/db/schema/ledgerEntries'
import type { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import type { UsageCreditApplication } from '@/db/schema/usageCreditApplications'
import type { UsageCredit } from '@/db/schema/usageCredits'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import {
  bulkInsertLedgerEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { insertLedgerTransaction } from '@/db/tableMethods/ledgerTransactionMethods'
import { bulkInsertUsageCreditApplications } from '@/db/tableMethods/usageCreditApplicationMethods'
import { bulkInsertUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import type { DbTransaction } from '@/db/types'
import { NotFoundError } from '@/errors'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  SubscriptionItemType,
  UsageCreditApplicationStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import core from '@/utils/core'
import type { InvoiceLineItem } from '../schema/invoiceLineItems'
import { selectBillingRunById } from '../tableMethods/billingRunMethods'

/**
 * @description Given a paid invoice line item for usage, creates the insert
 * payload for a `UsageCredit` grant. This grant represents the value of the payment
 * made for that specific usage.
 * @param invoiceLineItem The invoice line item that has been paid.
 * @param ledgerAccount The ledger account associated with the invoice line item.
 * @returns A `UsageCredit.Insert` object ready for database insertion.
 */
export const usageCreditInsertFromInvoiceLineItem = (
  invoiceLineItem: InvoiceLineItem.Record,
  ledgerAccount: LedgerAccount.Record
): UsageCredit.Insert => {
  if (invoiceLineItem.type !== SubscriptionItemType.Usage) {
    throw new Error(
      `Invoice line item type ${invoiceLineItem.type} is not supported for usage credit grant creation.`
    )
  }
  if (ledgerAccount.id !== invoiceLineItem.ledgerAccountId) {
    throw new Error(
      `Ledger account ID ${ledgerAccount.id} does not match invoice line item ledger account ID ${invoiceLineItem.ledgerAccountId}.`
    )
  }
  if (!ledgerAccount.usageMeterId) {
    throw new Error(
      `Ledger account ${ledgerAccount.id} does not have a usage meter ID.`
    )
  }
  const usageCreditInsert: UsageCredit.Insert = {
    usageMeterId: ledgerAccount.usageMeterId,
    status: UsageCreditStatus.Posted,
    livemode: invoiceLineItem.livemode,
    organizationId: ledgerAccount.organizationId,
    subscriptionId: ledgerAccount.subscriptionId,
    creditType: UsageCreditType.Payment,
    issuedAmount: invoiceLineItem.ledgerAccountCredit,
    notes: `Payment settlement for invoice line item ${invoiceLineItem.id} / ${invoiceLineItem.invoiceId}`,
    metadata: {},
    sourceReferenceType:
      UsageCreditSourceReferenceType.InvoiceSettlement,
    sourceReferenceId: invoiceLineItem.invoiceId,
    issuedAt: invoiceLineItem.createdAt,
    expiresAt: null,
    paymentId: null,
  }
  return usageCreditInsert
}

/**
 * @description Finds all outstanding `usage_cost` ledger entries from the invoice's
 * billing run and creates the necessary `UsageCreditApplication` records to offset them.
 * This is the core step that links the new settlement credits to the old usage debts.
 * @param creditGrants The newly created `UsageCredit` grants from the invoice payment.
 * @param invoice The paid invoice being settled.
 * @param invoiceLineItems The line items of the paid invoice.
 * @param ledgerAccountsById A map of ledger accounts keyed by their ID for efficient lookup.
 * @param transaction The database transaction.
 * @returns A promise that resolves to an array of the newly created `UsageCreditApplication` records.
 */
const createCreditApplicationsForOutstandingUsageCosts = async (
  creditGrants: UsageCredit.Record[],
  invoice: Invoice.Record,
  invoiceLineItems: InvoiceLineItem.Record[],
  ledgerAccountsById: Map<string, LedgerAccount.Record>,
  transaction: DbTransaction
): Promise<UsageCreditApplication.Record[]> => {
  if (!invoice.billingRunId) {
    throw new Error(
      `Invoice ${invoice.id} does not have a billing run ID.`
    )
  }
  // Validate billing run exists
  const billingRunResult = await selectBillingRunById(
    invoice.billingRunId,
    transaction
  )
  if (Result.isError(billingRunResult)) {
    throw new Error(`Billing run ${invoice.billingRunId} not found.`)
  }
  const ledgerAccountIds = invoiceLineItems
    .map((lineItem) => lineItem.ledgerAccountId)
    .filter((id) => !core.isNil(id))
  const rawUsageCostsInNeedOfCreditApplication =
    await selectLedgerEntries(
      {
        entryType: LedgerEntryType.UsageCost,
        claimedByBillingRunId: invoice.billingRunId,
        ledgerAccountId: ledgerAccountIds,
      },
      transaction
    )
  const usageCostsInNeedOfCreditApplication =
    rawUsageCostsInNeedOfCreditApplication.map((item) =>
      usageCostSelectSchema.parse(item)
    )
  const usageCreditsByUsageMeterId = new Map<
    string,
    UsageCredit.Record
  >(
    creditGrants.map((creditGrant) => [
      creditGrant.usageMeterId,
      creditGrant,
    ])
  )
  const creditApplicationInserts: UsageCreditApplication.Insert[] = []
  usageCostsInNeedOfCreditApplication.forEach((usageCost) => {
    const ledgerAccount = ledgerAccountsById.get(
      usageCost.ledgerAccountId
    )
    if (!ledgerAccount) {
      // This should ideally not happen if data is consistent.
      throw new Error(
        `Ledger account ${usageCost.ledgerAccountId} not found for usage cost ${usageCost.id}`
      )
    }
    if (!ledgerAccount.usageMeterId) {
      // This should be caught earlier, but as a safeguard.
      throw new Error(
        `Ledger account ${ledgerAccount.id} does not have a usage meter ID.`
      )
    }
    const usageCredit = usageCreditsByUsageMeterId.get(
      ledgerAccount.usageMeterId
    )
    if (!usageCredit) {
      throw new Error(
        `Usage credit not found for usage meter ID ${ledgerAccount.usageMeterId}.`
      )
    }
    creditApplicationInserts.push({
      status: UsageCreditApplicationStatus.Posted,
      livemode: invoice.livemode,
      organizationId: invoice.organizationId,
      usageCreditId: usageCredit.id,
      usageEventId: usageCost.sourceUsageEventId,
      amountApplied: usageCost.amount,
      targetUsageMeterId: usageCredit.usageMeterId,
      appliedAt: usageCost.createdAt,
    })
  })
  return await bulkInsertUsageCreditApplications(
    creditApplicationInserts,
    transaction
  )
}

/**
 * @description Generates the double-entry ledger records for each credit application.
 * For each application, it creates two entries:
 * 1. A debit from the credit balance, reducing the available credit.
 * 2. A credit towards the usage cost, effectively "paying off" the debt.
 * @param creditApplications The `UsageCreditApplication` records created for the settlement.
 * @param ledgerTransaction The parent ledger transaction for this settlement.
 * @param usageCreditsById A map of usage credits keyed by their ID.
 * @param ledgerAccountsByUsageMeterId A map of ledger accounts keyed by their usage meter ID.
 * @returns An array of ledger entry inserts.
 */
const debitsFromCreditBalanceAndCreditsTowardsUsageCostsForSettlementInserts =
  (
    creditApplications: UsageCreditApplication.Record[],
    ledgerTransaction: LedgerTransaction.Record,
    usageCreditsById: Map<string, UsageCredit.Record>,
    ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>
  ): LedgerEntry.Insert[] => {
    const ledgerEntryInserts: (
      | LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert
      | LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert
    )[] = []
    creditApplications.forEach((creditApplication) => {
      const usageCredit = usageCreditsById.get(
        creditApplication.usageCreditId
      )
      if (!usageCredit) {
        throw new Error(
          `Usage credit ${creditApplication.usageCreditId} not found for credit application ${creditApplication.id}.`
        )
      }
      const ledgerAccount = ledgerAccountsByUsageMeterId.get(
        usageCredit.usageMeterId
      )
      if (!ledgerAccount) {
        throw new Error(
          `Ledger account not found for usage meter ID ${usageCredit.usageMeterId}.`
        )
      }
      const creditApplicationCreditTowardsUsageCostInsert: LedgerEntry.UsageCreditApplicationCreditTowardsUsageCostInsert =
        {
          status: LedgerEntryStatus.Posted,
          livemode: creditApplication.livemode,
          organizationId: creditApplication.organizationId,
          metadata: {},
          subscriptionId: ledgerAccount.subscriptionId,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: ledgerTransaction.id,
          entryType:
            LedgerEntryType.UsageCreditApplicationCreditTowardsUsageCost,
          entryTimestamp: creditApplication.createdAt!,
          direction: LedgerEntryDirection.Credit,
          discardedAt: null,
          amount: creditApplication.amountApplied,
          claimedByBillingRunId: null,
          sourceUsageEventId: creditApplication.usageEventId,
          sourceUsageCreditId: creditApplication.usageCreditId,
          sourceCreditApplicationId: creditApplication.id,
          sourceCreditBalanceAdjustmentId: null,
          sourceBillingPeriodCalculationId: null,
        }
      ledgerEntryInserts.push(
        creditApplicationCreditTowardsUsageCostInsert
      )

      const creditApplicationDebitFromCreditBalanceInsert: LedgerEntry.UsageCreditApplicationDebitFromCreditBalanceInsert =
        {
          status: LedgerEntryStatus.Posted,
          livemode: creditApplication.livemode,
          organizationId: creditApplication.organizationId,
          metadata: {},
          subscriptionId: ledgerAccount.subscriptionId,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: ledgerTransaction.id,
          entryType:
            LedgerEntryType.UsageCreditApplicationDebitFromCreditBalance,
          entryTimestamp: creditApplication.createdAt!,
          direction: LedgerEntryDirection.Debit,
          discardedAt: null,
          amount: creditApplication.amountApplied,
          claimedByBillingRunId: null,
          sourceUsageEventId: creditApplication.usageEventId,
          sourceUsageCreditId: creditApplication.usageCreditId,
          sourceCreditApplicationId: creditApplication.id,
          sourceCreditBalanceAdjustmentId: null,
          sourceBillingPeriodCalculationId: null,
        }
      ledgerEntryInserts.push(
        creditApplicationDebitFromCreditBalanceInsert
      )
    })
    return ledgerEntryInserts
  }

/**
 * @description Generates the `credit_grant_recognized` ledger entries. These entries
 * represent the official posting of the credit value to the
 * customer's ledger account, making the credit available for use.
 * @param usageCredits The newly created `UsageCredit` grants.
 * @param ledgerTransaction The parent ledger transaction.
 * @param ledgerAccountsByUsageMeterId A map of ledger accounts keyed by usage meter ID.
 * @returns An array of `CreditGrantRecognized` ledger entry inserts.
 */
const creditGrantRecognizedLedgerEntryInserts = (
  usageCredits: UsageCredit.Record[],
  ledgerTransaction: LedgerTransaction.Record,
  ledgerAccountsByUsageMeterId: Map<string, LedgerAccount.Record>
): LedgerEntry.Insert[] => {
  return usageCredits.map((usageCredit) => {
    const ledgerAccount = ledgerAccountsByUsageMeterId.get(
      usageCredit.usageMeterId
    )
    if (!ledgerAccount) {
      throw new Error(
        `Ledger account not found for usage meter ID ${usageCredit.usageMeterId}.`
      )
    }
    const creditGrantRecognizedInsert: LedgerEntry.CreditGrantRecognizedInsert =
      {
        ...ledgerEntryNulledSourceIdColumns,
        status: LedgerEntryStatus.Posted,
        livemode: usageCredit.livemode,
        organizationId: usageCredit.organizationId,
        metadata: {},
        subscriptionId: ledgerAccount.subscriptionId,
        ledgerAccountId: ledgerAccount.id,
        ledgerTransactionId: ledgerTransaction.id,
        entryType: LedgerEntryType.CreditGrantRecognized,
        entryTimestamp: usageCredit.issuedAt,
        direction: LedgerEntryDirection.Credit,
        usageMeterId: usageCredit.usageMeterId,
        discardedAt: null,
        amount: usageCredit.issuedAmount,
        sourceUsageCreditId: usageCredit.id,
        claimedByBillingRunId: null,
      }
    return creditGrantRecognizedInsert
  })
}

/**
 * @description Iterates through the usage-based invoice line items and creates a
 * `UsageCredit` grant for each one.
 * @param invoiceLineItems All line items from the paid invoice.
 * @param ledgerAccountsById A map of ledger accounts keyed by their ID.
 * @param transaction The database transaction.
 * @returns A promise that resolves to an array of the newly created `UsageCredit` records.
 */
const createUsageCreditsForInvoiceLineItems = async (
  invoiceLineItems: InvoiceLineItem.Record[],
  ledgerAccountsById: Map<string, LedgerAccount.Record>,
  transaction: DbTransaction
): Promise<Result<UsageCredit.Record[], NotFoundError>> => {
  const usageCreditInserts: UsageCredit.Insert[] = []
  const usageCostLineItems = invoiceLineItems.filter(
    (lineItem) => lineItem.type === SubscriptionItemType.Usage
  )
  for (const lineItem of usageCostLineItems) {
    const ledgerAccount = ledgerAccountsById.get(
      lineItem.ledgerAccountId!
    )
    if (!ledgerAccount) {
      return Result.err(
        new NotFoundError(
          'ledgerAccount',
          `not found for line item ${lineItem.id}`
        )
      )
    }
    usageCreditInserts.push(
      usageCreditInsertFromInvoiceLineItem(lineItem, ledgerAccount)
    )
  }
  return await bulkInsertUsageCredits(usageCreditInserts, transaction)
}

/**
 * @description Processes the settlement of an invoice. This command is dispatched
 * after a payment has been confirmed. It encapsulates the entire accounting procedure
 * for settlement.
 *
 * @param command The SettleInvoiceUsageCostsLedgerCommand, containing the invoice.
 * @param transaction The database transaction.
 * @returns A LedgerCommandResult with the created transaction and ledger entries.
 */
export const processSettleInvoiceUsageCostsLedgerCommand = async (
  command: SettleInvoiceUsageCostsLedgerCommand,
  transaction: DbTransaction
): Promise<Result<LedgerCommandResult, NotFoundError>> => {
  // 1. Create the parent LedgerTransaction. All subsequent ledger entries created
  // in this command will be linked to this single transaction, providing a clear
  // audit trail for the entire settlement operation.
  const ledgerTransaction = await insertLedgerTransaction(
    {
      type: LedgerTransactionType.SettleInvoiceUsageCosts,
      livemode: command.livemode,
      organizationId: command.organizationId,
      subscriptionId: command.subscriptionId,
      description: `Settlement of invoice ${command.payload.invoice.id}`,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.InvoiceSettlement,
      initiatingSourceId: command.payload.invoice.id,
      metadata: {},
    },
    transaction
  )
  // 2. Fetch all unique ledger accounts associated with the invoice's line items.
  // This is necessary to get details like usage_meter_id for each account.
  const ledgerAccounts = await selectLedgerAccounts(
    {
      id: command.payload.invoiceLineItems
        .map((lineItem) => lineItem.ledgerAccountId)
        .filter((id) => !core.isNil(id)),
      organizationId: command.organizationId,
      subscriptionId: command.subscriptionId,
      livemode: command.livemode,
    },
    transaction
  )
  // Sanity check: Ensure we found a ledger account for every usage line item.
  // If not, it indicates a data inconsistency that must be resolved.
  const usageLineItems = command.payload.invoiceLineItems.filter(
    (ili) => ili.type === SubscriptionItemType.Usage
  )
  if (ledgerAccounts.length !== usageLineItems.length) {
    return Result.err(
      new NotFoundError(
        'ledgerAccounts',
        `Expected ${usageLineItems.length} ledger accounts for usage line items, but got ${ledgerAccounts.length}. One of the invoice line items is attempting to settle usage costs for a ledger account that is not within its organization + subscription + livemode scope.`
      )
    )
  }
  // 3. Create maps for efficient lookups. This avoids nested loops and improves performance.
  const ledgerAccountsById = new Map<string, LedgerAccount.Record>(
    ledgerAccounts.map((ledgerAccount) => [
      ledgerAccount.id,
      ledgerAccount,
    ])
  )
  const ledgerAccountsByUsageMeterId = new Map<
    string,
    LedgerAccount.Record
  >(
    ledgerAccounts
      .filter((la) => la.usageMeterId)
      .map((ledgerAccount) => [
        ledgerAccount.usageMeterId!,
        ledgerAccount,
      ])
  )
  // 4. Create the `UsageCredit` grant records from the paid invoice line items.
  const usageCreditsResult =
    await createUsageCreditsForInvoiceLineItems(
      command.payload.invoiceLineItems,
      ledgerAccountsById,
      transaction
    )
  if (Result.isError(usageCreditsResult)) {
    return Result.err(usageCreditsResult.error)
  }
  const usageCredits = usageCreditsResult.value
  const usageCreditsById = new Map<string, UsageCredit.Record>(
    usageCredits.map((uc) => [uc.id, uc])
  )
  // 5. Create the `UsageCreditApplication` records that link the new credit grants
  // to the old usage cost debts from the billing run.
  const creditApplications =
    await createCreditApplicationsForOutstandingUsageCosts(
      usageCredits,
      command.payload.invoice,
      command.payload.invoiceLineItems,
      ledgerAccountsById,
      transaction
    )
  // 6. Generate all the necessary ledger entry inserts for the entire settlement process.
  // First, recognize the value of the new credit grants.
  const creditGrantEntries = creditGrantRecognizedLedgerEntryInserts(
    usageCredits,
    ledgerTransaction,
    ledgerAccountsByUsageMeterId
  )
  // Second, create the debit/credit pairs for applying the credits to the usage costs.
  const creditApplicationEntries =
    debitsFromCreditBalanceAndCreditsTowardsUsageCostsForSettlementInserts(
      creditApplications,
      ledgerTransaction,
      usageCreditsById,
      ledgerAccountsByUsageMeterId
    )

  // Combine all ledger entry inserts into a single array for bulk insertion.
  const allLedgerEntryInserts = [
    ...creditGrantEntries,
    ...creditApplicationEntries,
  ]
  // 7. Bulk insert all created ledger entries into the database. This is the final
  // step that atomically records the entire settlement in the ledger.
  const ledgerEntriesResult = await bulkInsertLedgerEntries(
    allLedgerEntryInserts,
    transaction
  )
  if (Result.isError(ledgerEntriesResult)) {
    return Result.err(ledgerEntriesResult.error)
  }
  return Result.ok({
    ledgerTransaction,
    ledgerEntries: ledgerEntriesResult.value,
  })
}
