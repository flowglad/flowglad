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
