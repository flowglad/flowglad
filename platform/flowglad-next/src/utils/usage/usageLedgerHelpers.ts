import { UsageEvent } from '@/db/schema/usageEvents'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import { UsageTransaction } from '@/db/schema/usageTransactions'
import { Payment } from '@/db/schema/payments'
import {
  expirePendingLedgerEntrysForPayment,
  insertLedgerEntry,
} from '@/db/tableMethods/ledgerEntryMethods'
import {
  insertUsageTransaction,
  insertUsageTransactionOrDoNothingByIdempotencyKey,
} from '@/db/tableMethods/usageTransactionMethods'
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import { UsageCredit } from '@/db/schema/usageCredits'
import { DbTransaction } from '@/db/types'
import {
  LedgerEntryDirection,
  LedgerEntryEntryType,
  LedgerEntryStatus,
  UsageTransactionInitiatingSourceType,
  UsageCreditType,
  UsageCreditStatus,
  UsageCreditSourceReferenceType,
  PaymentStatus,
} from '@/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'

interface UsageLedgerTransactionResult {
  ledgerEntries: LedgerEntry.Record[]
  /**
   * Returns the usage transaction if it was created, otherwise null if the event was already recorded.
   */
  usageTransaction: UsageTransaction.Record | null
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
  const usageTransaction = await insertUsageTransaction(
    {
      livemode: usageEvent.livemode,
      organizationId,
      description: `Ingesting Usage Event ${usageEvent.id}`,
      initiatingSourceType:
        UsageTransactionInitiatingSourceType.UsageEvent,
      initiatingSourceId: usageEvent.id,
      subscriptionId: usageEvent.subscriptionId,
      usageMeterId: usageEvent.usageMeterId,
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
      status: LedgerEntryStatus.Posted,
      livemode: usageEvent.livemode,
      organizationId,
      usageTransactionId: usageTransaction.id,
      subscriptionId: usageEvent.subscriptionId,
      direction: LedgerEntryDirection.Debit,
      entryType: LedgerEntryEntryType.UsageCost,
      amount: usageEvent.amount,
      description: `Ingesting Usage Event ${usageEvent.id}`,
      ledgerAccountId: ledgerAccount.id,
    },
    transaction
  )
  return {
    ledgerEntries: [ledgerEntries],
    usageTransaction,
  }
}

/**
 * Creates a ledger transaction for a payment initiation.
 * This will create a pending usage ledger item for the payment amount.
 * The pending usage ledger item will be expired if the payment is confirmed.
 */
export const createPaymentInitiationLedgerTransaction = async (
  {
    payment,
    usageMeter,
  }: { payment: Payment.Record; usageMeter: UsageMeter.Record },
  transaction: DbTransaction
): Promise<UsageLedgerTransactionResult> => {
  const usageTransaction = await createUsageTransactionForPayment(
    payment,
    usageMeter,
    transaction
  )
  if (!usageTransaction) {
    return {
      ledgerEntries: [],
      usageTransaction: null,
    }
  }
  const [ledgerAccount] = await selectLedgerAccounts(
    {
      subscriptionId: payment.subscriptionId!,
      usageMeterId: usageMeter.id,
    },
    transaction
  )
  const ledgerEntries = await insertLedgerEntry(
    {
      status: LedgerEntryStatus.Pending,
      livemode: payment.livemode,
      organizationId: payment.organizationId,
      usageTransactionId: usageTransaction.id,
      subscriptionId: payment.subscriptionId!,
      direction: LedgerEntryDirection.Credit,
      entryType: LedgerEntryEntryType.PaymentInitiated,
      /**
       * TODO: figure out how much the payment grants the user in credits (?????)
       */
      amount: -1,
      description: `Payment ${payment.id} initiated`,
      sourcePaymentId: payment.id,
      ledgerAccountId: ledgerAccount.id,
    },
    transaction
  )

  return {
    ledgerEntries: [ledgerEntries],
    usageTransaction,
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
const createUsageTransactionForPayment = async (
  payment: Payment.Record,
  usageMeter: UsageMeter.Record,
  transaction: DbTransaction
): Promise<UsageTransaction.Record | null> => {
  const subscriptionId = payment.subscriptionId
  if (!subscriptionId) {
    throw new Error(
      `Payment ${payment.id} has no subscription ID. Cannot create usage transaction.`
    )
  }
  const organizationId = payment.organizationId
  const [usageTransaction] =
    await insertUsageTransactionOrDoNothingByIdempotencyKey(
      {
        livemode: payment.livemode,
        organizationId,
        description: `Recognizing ${payment.status} payment: ${payment.id}`,
        initiatingSourceType:
          UsageTransactionInitiatingSourceType.Payment,
        initiatingSourceId: payment.id,
        subscriptionId,
        usageMeterId: usageMeter.id,
        idempotencyKey: `${payment.id}-${payment.status}`,
      },
      transaction
    )
  if (!usageTransaction) {
    return null
  }
  return usageTransaction
}

const entryTypeFromPaymentStatus = (payment: Payment.Record) => {
  if (payment.status === PaymentStatus.Succeeded) {
    return LedgerEntryEntryType.PaymentSucceeded
  } else if (payment.status === PaymentStatus.Failed) {
    return LedgerEntryEntryType.PaymentFailed
  } else if (payment.status === PaymentStatus.Processing) {
    return LedgerEntryEntryType.PaymentInitiated
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
  }: {
    payment: Payment.Record
    usageMeter: UsageMeter.Record
  },
  transaction: DbTransaction
): Promise<UsageLedgerTransactionResult> => {
  const subscriptionId = payment.subscriptionId
  if (!subscriptionId) {
    throw new Error(
      `Payment ${payment.id} has no subscription ID. Cannot create usage credit.`
    )
  }

  const usageTransaction = await createUsageTransactionForPayment(
    payment,
    usageMeter,
    transaction
  )
  if (!usageTransaction) {
    return {
      ledgerEntries: [],
      usageTransaction: null,
    }
  }
  const entryType = entryTypeFromPaymentStatus(payment)
  const [ledgerAccount] = await selectLedgerAccounts(
    {
      subscriptionId: payment.subscriptionId!,
      usageMeterId: usageMeter.id,
    },
    transaction
  )
  const ledgerEntries = await insertLedgerEntry(
    {
      status: LedgerEntryStatus.Posted,
      livemode: payment.livemode,
      organizationId: payment.organizationId,
      usageTransactionId: usageTransaction.id,
      subscriptionId: payment.subscriptionId!,
      direction: LedgerEntryDirection.Credit,
      entryType,
      amount: payment.amount,
      description: `Payment ${payment.id} recognized and credits issued`,
      sourcePaymentId: payment.id,
      ledgerAccountId: ledgerAccount.id,
    },
    transaction
  )

  const expiredLedgerEntrys =
    await expirePendingLedgerEntrysForPayment(
      payment.id,
      usageTransaction,
      transaction
    )

  return {
    ledgerEntries: [ledgerEntries, ...expiredLedgerEntrys],
    usageTransaction,
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
  const usageTransaction = await createUsageTransactionForPayment(
    payment,
    usageMeter,
    transaction
  )
  if (!usageTransaction) {
    return {
      ledgerEntries: [],
      usageTransaction: null,
    }
  }
  await expirePendingLedgerEntrysForPayment(
    payment.id,
    usageTransaction,
    transaction
  )
  return {
    ledgerEntries: [],
    usageTransaction,
  }
}
