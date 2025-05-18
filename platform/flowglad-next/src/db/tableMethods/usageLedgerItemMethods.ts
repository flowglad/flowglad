import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  usageLedgerItems,
  usageLedgerItemsInsertSchema,
  usageLedgerItemsSelectSchema,
  usageLedgerItemsUpdateSchema,
} from '@/db/schema/usageLedgerItems'
import { DbTransaction } from '../types'
import { UsageLedgerItemStatus } from '@/types'
import { and, eq, inArray } from 'drizzle-orm'
import { UsageTransaction } from '../schema/usageTransactions'

const config: ORMMethodCreatorConfig<
  typeof usageLedgerItems,
  typeof usageLedgerItemsSelectSchema,
  typeof usageLedgerItemsInsertSchema,
  typeof usageLedgerItemsUpdateSchema
> = {
  selectSchema: usageLedgerItemsSelectSchema,
  insertSchema: usageLedgerItemsInsertSchema,
  updateSchema: usageLedgerItemsUpdateSchema,
  tableName: 'usage_ledger_items',
}

export const selectUsageLedgerItemById = createSelectById(
  usageLedgerItems,
  config
)
export const insertUsageLedgerItem = createInsertFunction(
  usageLedgerItems,
  config
)
export const updateUsageLedgerItem = createUpdateFunction(
  usageLedgerItems,
  config
)
export const selectUsageLedgerItems = createSelectFunction(
  usageLedgerItems,
  config
)

export const expirePendingUsageLedgerItemsForPayment = async (
  paymentId: string,
  usageTransaction: UsageTransaction.Record,
  transaction: DbTransaction
) => {
  const pendingUsageLedgerItems = await selectUsageLedgerItems(
    {
      sourcePaymentId: paymentId,
      status: UsageLedgerItemStatus.Pending,
    },
    transaction
  )
  await transaction
    .update(usageLedgerItems)
    .set({
      expiredAt: new Date(),
      expiredAtUsageTransactionId: usageTransaction.id,
    })
    .where(
      and(
        inArray(
          usageLedgerItems.id,
          pendingUsageLedgerItems.map((item) => item.id)
        ),
        eq(
          usageLedgerItems.subscriptionId,
          usageTransaction.subscriptionId
        )
      )
    )
    .returning()

  return pendingUsageLedgerItems
}
