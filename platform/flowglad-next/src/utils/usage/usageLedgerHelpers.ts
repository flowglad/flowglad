import { UsageEvent } from '@/db/schema/usageEvents'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '@/db/schema/ledgerEntries'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import { Payment } from '@/db/schema/payments'
import {
  expirePendingLedgerEntriesForPayment,
  insertLedgerEntry,
} from '@/db/tableMethods/ledgerEntryMethods'
import {
  insertLedgerTransaction,
  insertLedgerTransactionOrDoNothingByIdempotencyKey,
} from '@/db/tableMethods/ledgerTransactionMethods'
import { DbTransaction } from '@/db/types'
import {
  LedgerEntryDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  PaymentStatus,
} from '@/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import { UsageCredit } from '@/db/schema/usageCredits'

interface UsageLedgerTransactionResult {
  ledgerEntries: LedgerEntry.Record[]
  /**
   * Returns the usage transaction if it was created, otherwise null if the event was already recorded.
   */
  ledgerTransaction: LedgerTransaction.Record | null
}

export const createUsageEventLedgerTransaction = async (
  {
    usageEvent,
    organizationId,
  }: { usageEvent: UsageEvent.Record; organizationId: string },
  transaction: DbTransaction
): Promise<UsageLedgerTransactionResult> => {
  if (usageEvent.amount <= 0) {
    throw new Error(
      `Usage event amount must be 0 or greater. Received ${usageEvent.amount} for usage event ${usageEvent.id}`
    )
  }

  const ledgerTransaction = await insertLedgerTransaction(
    {
      livemode: usageEvent.livemode,
      organizationId,
      description: `Ingesting Usage Event ${usageEvent.id}`,
      initiatingSourceType:
        LedgerTransactionInitiatingSourceType.UsageEvent,
      initiatingSourceId: usageEvent.id,
      subscriptionId: usageEvent.subscriptionId,
      type: LedgerTransactionType.UsageEventProcessed,
      metadata: {},
    },
    transaction
  )

  const [ledgerAccount] = await selectLedgerAccounts(
    {
      subscriptionId: usageEvent.subscriptionId,
      usageMeterId: usageEvent.usageMeterId,
    },
    transaction
  )
  const ledgerEntries = await insertLedgerEntry(
    {
      ...ledgerEntryNulledSourceIdColumns,
      sourceUsageEventId: usageEvent.id,
      status: LedgerEntryStatus.Posted,
      livemode: usageEvent.livemode,
      organizationId,
      ledgerTransactionId: ledgerTransaction.id,
      subscriptionId: usageEvent.subscriptionId,
      direction: LedgerEntryDirection.Debit,
      entryType: LedgerEntryType.UsageCost,
      amount: usageEvent.amount,
      description: `Ingesting Usage Event ${usageEvent.id}`,
      ledgerAccountId: ledgerAccount.id,
      metadata: {
        usageEventId: usageEvent.id,
      },
      entryTimestamp: usageEvent.createdAt,
      expiredAt: null,
      discardedAt: null,
    },
    transaction
  )
  return {
    ledgerEntries: [ledgerEntries],
    ledgerTransaction,
  }
}

/**
 * TODO: do not create a usage transaction if there is already one
 * for the payment at this status: use payment + status as idempotency key.
 * @param payment
 * @param usageMeter
 * @param transaction
 * @returns
 */
const createLedgerTransactionForPaymentRecognition = async (
  payment: Payment.Record,
  usageMeter: UsageMeter.Record,
  transaction: DbTransaction
): Promise<LedgerTransaction.Record | null> => {
  const subscriptionId = payment.subscriptionId
  if (!subscriptionId) {
    throw new Error(
      `Payment ${payment.id} has no subscription ID. Cannot create usage transaction.`
    )
  }
  const organizationId = payment.organizationId
  const [ledgerTransaction] =
    await insertLedgerTransactionOrDoNothingByIdempotencyKey(
      {
        livemode: payment.livemode,
        organizationId,
        description: `Recognizing ${payment.status} payment: ${payment.id}`,
        type: LedgerTransactionType.PaymentConfirmed,
        initiatingSourceType:
          LedgerTransactionInitiatingSourceType.Payment,
        initiatingSourceId: payment.id,
        subscriptionId,
        idempotencyKey: `${payment.id}-${payment.status}`,
        metadata: {},
      },
      transaction
    )
  if (!ledgerTransaction) {
    return null
  }
  return ledgerTransaction
}

const entryTypeFromPaymentStatus = (payment: Payment.Record) => {
  if (payment.status === PaymentStatus.Succeeded) {
    return LedgerEntryType.PaymentSucceeded
  } else if (payment.status === PaymentStatus.Failed) {
    return LedgerEntryType.PaymentFailed
  } else if (payment.status === PaymentStatus.Processing) {
    return LedgerEntryType.PaymentInitiated
  } else {
    throw new Error(
      `Payment ${payment.id} has unknown status. Cannot create usage ledger item.`
    )
  }
}

/**
 * Creates a ledger transaction for a payment confirmation.
 * This will create a usage credit for the payment amount.
 * The usage credit will be posted if the payment is confirmed.
 * The pending usage ledger item will be expired if the payment is confirmed.
 */
export const postPaymentConfirmationLedgerTransaction = async (
  {
    payment,
    usageMeter,
    usageCredit,
  }: {
    payment: Payment.Record
    usageMeter: UsageMeter.Record
    usageCredit: UsageCredit.Record
  },
  transaction: DbTransaction
): Promise<UsageLedgerTransactionResult> => {
  const subscriptionId = payment.subscriptionId
  if (!subscriptionId) {
    throw new Error(
      `Payment ${payment.id} has no subscription ID. Cannot create usage credit.`
    )
  }

  const ledgerTransaction =
    await createLedgerTransactionForPaymentRecognition(
      payment,
      usageMeter,
      transaction
    )
  if (!ledgerTransaction) {
    return {
      ledgerEntries: [],
      ledgerTransaction: null,
    }
  }
  const [ledgerAccount] = await selectLedgerAccounts(
    {
      subscriptionId: payment.subscriptionId!,
      usageMeterId: usageMeter.id,
    },
    transaction
  )
  const paymentSucceededLedgerEntryInsert: LedgerEntry.PaymentSucceededInsert =
    {
      ...ledgerEntryNulledSourceIdColumns,
      status: LedgerEntryStatus.Posted,
      livemode: payment.livemode,
      organizationId: payment.organizationId,
      ledgerTransactionId: ledgerTransaction.id,
      subscriptionId: payment.subscriptionId!,
      direction: LedgerEntryDirection.Credit,
      entryType: LedgerEntryType.PaymentSucceeded,
      amount: payment.amount,
      description: `Payment ${payment.id} recognized and credits issued`,
      sourcePaymentId: payment.id,
      sourceUsageCreditId: usageCredit.id,
      ledgerAccountId: ledgerAccount.id,
      discardedAt: null,
      expiredAt: null,
      entryTimestamp: payment.createdAt,
      metadata: {},
    }
  const ledgerEntry = await insertLedgerEntry(
    paymentSucceededLedgerEntryInsert,
    transaction
  )

  return {
    ledgerEntries: [ledgerEntry],
    ledgerTransaction,
  }
}

/**
 * Creates a ledger transaction for a payment failure.
 * This will create a usage ledger item for the payment amount.
 * The usage ledger item will be posted if the payment is failed.
 */
export const postPaymentFailedLedgerTransaction = async (
  {
    payment,
    usageMeter,
  }: { payment: Payment.Record; usageMeter: UsageMeter.Record },
  transaction: DbTransaction
): Promise<UsageLedgerTransactionResult> => {
  const subscriptionId = payment.subscriptionId
  if (!subscriptionId) {
    throw new Error(
      `Payment ${payment.id} has no subscription ID. Cannot create usage credit.`
    )
  }
  const ledgerTransaction =
    await createLedgerTransactionForPaymentRecognition(
      payment,
      usageMeter,
      transaction
    )
  if (!ledgerTransaction) {
    return {
      ledgerEntries: [],
      ledgerTransaction: null,
    }
  }
  await expirePendingLedgerEntriesForPayment(
    payment.id,
    ledgerTransaction,
    transaction
  )
  return {
    ledgerEntries: [],
    ledgerTransaction,
  }
}
