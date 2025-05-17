import { UsageEvent } from '@/db/schema/usageEvents'
import { UsageLedgerItem } from '@/db/schema/usageLedgerItems'
import { UsageTransaction } from '@/db/schema/usageTransactions'
import { insertUsageLedgerItem } from '@/db/tableMethods/usageLedgerItemMethods'
import { insertUsageTransaction } from '@/db/tableMethods/usageTransactionMethods'
import { DbTransaction } from '@/db/types'
import {
  UsageLedgerItemDirection,
  UsageLedgerItemEntryType,
  UsageLedgerItemStatus,
  UsageTransactionInitiatingSourceType,
} from '@/types'

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
