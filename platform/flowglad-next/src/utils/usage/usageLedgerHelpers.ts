import { UsageEvent } from '@/db/schema/usageEvents'
import { insertUsageLedgerItem } from '@/db/tableMethods/usageLedgerItemMethods'
import { insertUsageTransaction } from '@/db/tableMethods/usageTransactionMethods'
import { DbTransaction } from '@/db/types'
import {
  UsageLedgerItemDirection,
  UsageLedgerItemEntryType,
  UsageLedgerItemStatus,
} from '@/types'

export const createUsageEventLedgerTransaction = async (
  {
    usageEvent,
    organizationId,
  }: { usageEvent: UsageEvent.Record; organizationId: string },
  transaction: DbTransaction
) => {
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
      usageTransactionId: usageEvent.id,
      subscriptionId: usageEvent.subscriptionId,
      direction: UsageLedgerItemDirection.Debit,
      entryType: UsageLedgerItemEntryType.UsageCost,
      amount: usageEvent.amount,
      description: `Ingesting Usage Event ${usageEvent.id}`,
    },
    transaction
  )
}
