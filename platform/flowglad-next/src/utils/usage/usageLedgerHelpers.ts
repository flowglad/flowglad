import { UsageEvent } from '@/db/schema/usageEvents'
import { UsageLedgerItem } from '@/db/schema/usageLedgerItems'
import { UsageTransaction } from '@/db/schema/usageTransactions'
import { Payment } from '@/db/schema/payments'
import {
  expirePendingUsageLedgerItemsForPayment,
  insertUsageLedgerItem,
  selectUsageLedgerItems,
} from '@/db/tableMethods/usageLedgerItemMethods'
import { insertUsageTransaction } from '@/db/tableMethods/usageTransactionMethods'
import { insertUsageCredit } from '@/db/tableMethods/usageCreditMethods'
import { UsageCredit } from '@/db/schema/usageCredits'
import { DbTransaction } from '@/db/types'
import {
  UsageLedgerItemDirection,
  UsageLedgerItemEntryType,
  UsageLedgerItemStatus,
  UsageTransactionInitiatingSourceType,
  UsageCreditType,
  UsageCreditStatus,
  UsageCreditSourceReferenceType,
  PaymentStatus,
} from '@/types'
import { UsageMeter } from '@/db/schema/usageMeters'

interface UsageLedgerTransactionResult {
  usageLedgerItems: UsageLedgerItem.Record[]
  usageTransaction: UsageTransaction.Record
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

  const usageLedgerItem = await insertUsageLedgerItem(
    {
      status: UsageLedgerItemStatus.Posted,
      livemode: usageEvent.livemode,
      organizationId,
      usageTransactionId: usageTransaction.id,
      subscriptionId: usageEvent.subscriptionId,
      direction: UsageLedgerItemDirection.Debit,
      entryType: UsageLedgerItemEntryType.UsageCost,
      amount: usageEvent.amount,
      description: `Ingesting Usage Event ${usageEvent.id}`,
    },
    transaction
  )
  return {
    usageLedgerItems: [usageLedgerItem],
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
  const usageTransaction = await insertUsageTransaction(
    {
      livemode: payment.livemode,
      organizationId: payment.organizationId,
      description: `Recording initiation of Payment ${payment.id}`,
      initiatingSourceType:
        UsageTransactionInitiatingSourceType.Payment,
      initiatingSourceId: payment.id,
      subscriptionId: payment.subscriptionId!,
      usageMeterId: usageMeter.id,
    },
    transaction
  )

  const usageLedgerItem = await insertUsageLedgerItem(
    {
      status: UsageLedgerItemStatus.Pending,
      livemode: payment.livemode,
      organizationId: payment.organizationId,
      usageTransactionId: usageTransaction.id,
      subscriptionId: payment.subscriptionId!,
      direction: UsageLedgerItemDirection.Credit,
      entryType: UsageLedgerItemEntryType.PaymentInitiated,
      /**
       * TODO: figure out how much the payment grants the user in credits (?????)
       */
      amount: -1,
      description: `Payment ${payment.id} initiated`,
      sourcePaymentId: payment.id,
    },
    transaction
  )

  return {
    usageLedgerItems: [usageLedgerItem],
    usageTransaction,
  }
}

const createUsageTransactionForPayment = async (
  payment: Payment.Record,
  usageMeter: UsageMeter.Record,
  transaction: DbTransaction
) => {
  const subscriptionId = payment.subscriptionId
  if (!subscriptionId) {
    throw new Error(
      `Payment ${payment.id} has no subscription ID. Cannot create usage transaction.`
    )
  }
  const organizationId = payment.organizationId
  const usageTransaction = await insertUsageTransaction(
    {
      livemode: payment.livemode,
      organizationId,
      description: `Recognizing ${payment.status} payment: ${payment.id}`,
      initiatingSourceType:
        UsageTransactionInitiatingSourceType.Payment,
      initiatingSourceId: payment.id,
      subscriptionId,
      usageMeterId: usageMeter.id,
    },
    transaction
  )
  return usageTransaction
}

const entryTypeFromPaymentStatus = (payment: Payment.Record) => {
  if (payment.status === PaymentStatus.Succeeded) {
    return UsageLedgerItemEntryType.PaymentSucceeded
  } else if (payment.status === PaymentStatus.Failed) {
    return UsageLedgerItemEntryType.PaymentFailed
  } else if (payment.status === PaymentStatus.Processing) {
    return UsageLedgerItemEntryType.PaymentInitiated
  } else {
    throw new Error(
      `Payment ${payment.id} has unknown status. Cannot create usage ledger item.`
    )
  }
}

const createNewPaymentUsageLedgerItem = async (
  payment: Payment.Record,
  usageTransaction: UsageTransaction.Record,
  transaction: DbTransaction
) => {
  const entryType = entryTypeFromPaymentStatus(payment)
  return await insertUsageLedgerItem(
    {
      status: UsageLedgerItemStatus.Posted,
      livemode: payment.livemode,
      organizationId: payment.organizationId,
      usageTransactionId: usageTransaction.id,
      subscriptionId: payment.subscriptionId!,
      direction: UsageLedgerItemDirection.Credit,
      entryType,
      amount: payment.amount,
      description: `Payment ${payment.id} recognized and credits issued`,
      sourcePaymentId: payment.id,
    },
    transaction
  )
}
/**
 * Creates a ledger transaction for a payment confirmation.
 * This will create a usage credit for the payment amount.
 * The usage credit will be posted if the payment is confirmed.
 * The pending usage ledger item will be expired if the payment is confirmed.
 */
export const createPaymentConfirmationLedgerEntries = async (
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

  const usageLedgerItem = await createNewPaymentUsageLedgerItem(
    payment,
    usageTransaction,
    transaction
  )

  const expiredUsageLedgerItems =
    await expirePendingUsageLedgerItemsForPayment(
      payment.id,
      usageTransaction,
      transaction
    )

  return {
    usageLedgerItems: [usageLedgerItem, ...expiredUsageLedgerItems],
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
) => {
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
  await expirePendingUsageLedgerItemsForPayment(
    payment.id,
    usageTransaction,
    transaction
  )
  return {
    usageLedgerItems: [],
    usageTransaction,
  }
}
