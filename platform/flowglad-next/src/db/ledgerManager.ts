import {
  AdminTransactionParams,
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  LedgerCommand,
  LedgerBackingRecord,
} from './transactionEnhacementTypes'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { bulkInsertLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { LedgerEntryDirection, LedgerEntryStatus } from '@/types'
import { insertLedgerTransaction } from './tableMethods/ledgerTransactionMethods'
import { PaymentStatus } from '@/types'

// TODO: Import other backing record schemas as they are added to LedgerBackingRecordUnion
// e.g., import { payments } from '@/db/schema/payments';

interface IdempotencyParts {
  initiatingSourceType: string
  initiatingSourceId: string
}

/**
 * Derives the initiatingSourceType and initiatingSourceId for a LedgerTransaction
 * based on the primary backing record and its state.
 * This is crucial for ensuring idempotency at the LedgerTransaction level.
 */
const deriveLedgerTransactionIdempotencyParts = (
  backingRecords: LedgerBackingRecord,
  commandDetails: LedgerCommand['transactionDetails']
): IdempotencyParts => {
  // Payments take precedence if present and have a relevant status for idempotency
  if (backingRecords.payments && backingRecords.payments.length > 0) {
    const payment = backingRecords.payments[0] // Assuming the first payment is primary for this transaction
    if (!payment.id) {
      throw new Error(
        'Payment record is missing an ID, cannot derive idempotency parts.'
      )
    }
    switch (payment.status) {
      case PaymentStatus.Succeeded:
        return {
          initiatingSourceType: 'payment_succeeded_confirmation',
          initiatingSourceId: payment.id,
        }
      case PaymentStatus.Failed:
        return {
          initiatingSourceType: 'payment_failed_notification',
          initiatingSourceId: payment.id,
        }
      case PaymentStatus.Processing: // Covers 'pending' as well if PaymentStatus.Pending is mapped to 'processing' or similar
        // case PaymentStatus.Pending: // If 'pending' is a distinct status in your enum and has its own ledger logic
        return {
          initiatingSourceType: 'payment_processing_update',
          initiatingSourceId: payment.id,
        }
      // Add other relevant payment statuses that trigger ledger transactions
      // e.g. case PaymentStatus.RequiresAction, case PaymentStatus.RequiresConfirmation
      default:
        // If payment status isn't one that defines a clear ledger operation type itself,
        // fall through or use a hint if available. For now, we'll throw error if no type is clear.
        throw new Error(
          `Cannot derive idempotency parts for payment with status: ${payment.status}`
        )
    }
  }

  // Refunds
  if (backingRecords.refunds && backingRecords.refunds.length > 0) {
    const refund = backingRecords.refunds[0]
    if (!refund.id) {
      throw new Error(
        'Refund record is missing an ID, cannot derive idempotency parts.'
      )
    }
    // Assuming refund creation/processing is the primary event here
    return {
      initiatingSourceType: 'payment_refund_processed', // Could also use refund.status if it varies
      initiatingSourceId: refund.id,
    }
  }

  // UsageCredits (e.g., grant recognition, expiration - might need hints or more context)
  if (
    backingRecords.usageCredits &&
    backingRecords.usageCredits.length > 0
  ) {
    const credit = backingRecords.usageCredits[0]
    if (!credit.id) {
      throw new Error(
        'UsageCredit record is missing an ID, cannot derive idempotency parts.'
      )
    }
    // This is a bit generic. The actual event (grant, expiration, etc.)
    // might need to be hinted or determined from a more specific flow.
    // For now, let's assume a generic grant recognition if no other context.
    // If commandDetails has explicit source type/id, those could be used as a fallback or primary.
    if (
      commandDetails.initiatingSourceType &&
      commandDetails.initiatingSourceId
    ) {
      return {
        initiatingSourceType: commandDetails.initiatingSourceType,
        initiatingSourceId: commandDetails.initiatingSourceId,
      }
    }
    // Example: if this is purely about the credit grant itself being recognized
    return {
      initiatingSourceType: 'credit_grant_recognized',
      initiatingSourceId: credit.id,
    }
  }

  // UsageCreditBalanceAdjustments
  if (
    backingRecords.usageCreditBalanceAdjustments &&
    backingRecords.usageCreditBalanceAdjustments.length > 0
  ) {
    const adjustment = backingRecords.usageCreditBalanceAdjustments[0]
    if (!adjustment.id) {
      throw new Error(
        'UsageCreditBalanceAdjustment record is missing an ID.'
      )
    }
    return {
      initiatingSourceType: 'credit_balance_adjustment_processed',
      initiatingSourceId: adjustment.id,
    }
  }

  // Fallback or error if no primary backing record type found or logic implemented
  // If the command details provided explicit source type/id, use them if no other rule matched.
  if (
    commandDetails.initiatingSourceType &&
    commandDetails.initiatingSourceId
  ) {
    return {
      initiatingSourceType: commandDetails.initiatingSourceType,
      initiatingSourceId: commandDetails.initiatingSourceId,
    }
  }

  throw new Error(
    'Could not derive LedgerTransaction idempotency parts: No primary backing record type matched or details provided.'
  )
}

/**
 * Maps a backing financial record (like a UsageCredit or Payment) to one or more LedgerEntry.Insert objects.
 * This function embodies the logic from the product spec's "Event-to-Ledger Workflows".
 *
 * @param backingRecord The source financial record instance.
 * @param ledgerTransactionId The ID of the parent LedgerTransaction (UsageTransactions record).
 * @param commonParams Contains organizationId, livemode, userId, etc.
 * @param dbTx The Drizzle transaction instance (if needed for complex lookups beyond the backingRecord).
 * @param ledgerTxDetails Optional details from the LedgerCommand for context.
 * @returns An array of LedgerEntry.Insert objects.
 */
function createLedgerEntryInsert(
  ledgerTransactionId: string,
  commonParams:
    | AdminTransactionParams
    | AuthenticatedTransactionParams,
  props: Partial<LedgerEntry.Insert> &
    Required<
      Pick<LedgerEntry.Insert, 'organizationId' | 'subscriptionId'>
    >
): LedgerEntry.Insert {
  const { livemode, userId } = commonParams
  const currentTimestamp = new Date()

  const baseEntry: Partial<LedgerEntry.Insert> = {
    ledgerTransactionId,
    entryTimestamp: currentTimestamp,
    status: LedgerEntryStatus.Posted,
    livemode,
    metadata: { createdBy: userId },
  }
  const fullEntry = {
    ...baseEntry,
    ...props,
  } as LedgerEntry.Insert
  return fullEntry
}

function mapBackingRecordToLedgerEntries(
  backingRecordsContainer: LedgerBackingRecord,
  ledgerTransactionId: string,
  commonParams:
    | AdminTransactionParams
    | AuthenticatedTransactionParams,
  dbTx: DbTransaction,
  ledgerTxDetails: LedgerCommand['transactionDetails']
): Array<LedgerEntry.Insert> {
  const allEntries: Array<LedgerEntry.Insert> = []

  // Process UsageCredits
  if (backingRecordsContainer.usageCredits) {
    for (const uc of backingRecordsContainer.usageCredits) {
      let entryType: string = 'credit_grant_recognized'
      let description = `Credit grant ${uc.id} for subscription ${uc.subscriptionId}`
      let sourcePaymentId: string | undefined = undefined

      if (
        ledgerTxDetails.initiatingSourceType ===
          'payment_confirmation' &&
        ledgerTxDetails.initiatingSourceId
      ) {
        entryType = 'payment_recognized'
        description = `Payment recognized (ID: ${ledgerTxDetails.initiatingSourceId}), funding credit ${uc.id}`
        sourcePaymentId = ledgerTxDetails.initiatingSourceId
      }

      allEntries.push(
        createLedgerEntryInsert(ledgerTransactionId, commonParams, {
          organizationId: uc.organizationId!,
          subscriptionId: uc.subscriptionId!,
          direction: LedgerEntryDirection.Credit,
          entryType,
          amount: uc.issuedAmount!,
          description,
          sourceUsageCreditId: uc.id,
          sourcePaymentId,
        })
      )
    }
  }

  // Process UsageCreditApplications
  if (backingRecordsContainer.usageCreditApplications) {
    for (const uca of backingRecordsContainer.usageCreditApplications) {
      allEntries.push(
        createLedgerEntryInsert(ledgerTransactionId, commonParams, {
          organizationId: uca.organizationId!,
          subscriptionId: ledgerTxDetails.subscriptionId,
          direction: LedgerEntryDirection.Debit,
          entryType: 'credit_applied_to_usage',
          amount: uca.amountApplied!,
          description: `Credit from grant ${uca.usageCreditId} applied. Run: ${uca.calculationRunId}`,
          sourceUsageCreditId: uca.usageCreditId,
          sourceCreditApplicationId: uca.id,
          calculationRunId: uca.calculationRunId,
        })
      )
    }
  }

  // Process UsageCreditBalanceAdjustments
  if (backingRecordsContainer.usageCreditBalanceAdjustments) {
    for (const ucba of backingRecordsContainer.usageCreditBalanceAdjustments) {
      allEntries.push(
        createLedgerEntryInsert(ledgerTransactionId, commonParams, {
          organizationId: ucba.organizationId!,
          subscriptionId: ledgerTxDetails.subscriptionId,
          direction: LedgerEntryDirection.Debit,
          entryType: 'credit_balance_adjusted',
          amount: ucba.amountAdjusted!,
          description: `Adjustment for credit ${ucba.adjustedUsageCreditId}. Reason: ${ucba.reason}`,
          sourceCreditBalanceAdjustmentId: ucba.id,
          sourceUsageCreditId: ucba.adjustedUsageCreditId,
        })
      )
    }
  }

  // TODO: Add similar blocks for other backing record types (payments, invoices, etc.)
  // as they are added to LedgerBackingRecord and have defined ledger mappings.

  if (allEntries.length === 0) {
    let hasRecords = false
    // Check if any array in backingRecordsContainer has items
    for (const key in backingRecordsContainer) {
      if (
        Object.prototype.hasOwnProperty.call(
          backingRecordsContainer,
          key
        ) &&
        Array.isArray(
          backingRecordsContainer[key as keyof LedgerBackingRecord]
        ) &&
        (
          backingRecordsContainer[
            key as keyof LedgerBackingRecord
          ] as any[]
        ).length > 0
      ) {
        hasRecords = true
        break
      }
    }
    if (hasRecords) {
      console.warn(
        `LedgerManager: No ledger entries generated despite backing records being present:`,
        backingRecordsContainer
      )
    }
  }

  return allEntries
}

/**
 * Processes a LedgerCommand by creating a parent LedgerTransaction (UsageTransactions record)
 * and then generating and inserting all associated LedgerEntry records.
 *
 * @param command The LedgerCommand containing details for the transaction and backing records.
 * @param params The transaction parameters (AdminTransactionParams or AuthenticatedTransactionParams).
 * @param tx The Drizzle transaction instance.
 */
export async function processLedgerCommand(
  command: LedgerCommand,
  params: AdminTransactionParams | AuthenticatedTransactionParams,
  tx: DbTransaction
): Promise<void> {
  const {
    organizationId: orgIdForLedgerTx,
    description,
    metadata,
    subscriptionId,
  } = command.transactionDetails

  // Derive initiatingSourceType and initiatingSourceId for idempotency
  const { initiatingSourceType, initiatingSourceId } =
    deriveLedgerTransactionIdempotencyParts(
      command.backingRecords,
      command.transactionDetails
    )

  const ledgerTransactionInput: LedgerTransaction.Insert = {
    organizationId: orgIdForLedgerTx,
    livemode: params.livemode,
    initiatingSourceType,
    initiatingSourceId,
    description,
    metadata: metadata as {},
    subscriptionId,
  }

  const insertedLedgerTransaction = await insertLedgerTransaction(
    ledgerTransactionInput,
    tx
  )

  if (!insertedLedgerTransaction || !insertedLedgerTransaction.id) {
    throw new Error(
      'Failed to insert ledger transaction or retrieve its ID'
    )
  }

  const allLedgerEntries = mapBackingRecordToLedgerEntries(
    command.backingRecords,
    insertedLedgerTransaction.id,
    params,
    tx,
    command.transactionDetails
  )

  if (allLedgerEntries.length > 0) {
    await bulkInsertLedgerEntries(allLedgerEntries, tx)
  }
}
