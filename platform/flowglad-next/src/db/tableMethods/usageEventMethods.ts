import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createBulkInsertOrDoNothingFunction,
} from '@/db/tableUtils'
import {
  UsageEvent,
  usageEvents,
  usageEventsInsertSchema,
  usageEventsSelectSchema,
  usageEventsUpdateSchema,
} from '@/db/schema/usageEvents'
import { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof usageEvents,
  typeof usageEventsSelectSchema,
  typeof usageEventsInsertSchema,
  typeof usageEventsUpdateSchema
> = {
  selectSchema: usageEventsSelectSchema,
  insertSchema: usageEventsInsertSchema,
  updateSchema: usageEventsUpdateSchema,
  tableName: 'usage_events',
}

export const selectUsageEventById = createSelectById(
  usageEvents,
  config
)

export const insertUsageEvent = createInsertFunction(
  usageEvents,
  config
)

export const updateUsageEvent = createUpdateFunction(
  usageEvents,
  config
)

export const selectUsageEvents = createSelectFunction(
  usageEvents,
  config
)

const bulkInsertOrDoNothingUsageEvents =
  createBulkInsertOrDoNothingFunction(usageEvents, config)

export const bulkInsertOrDoNothingUsageEventsByTransactionId = (
  usageEventInserts: UsageEvent.Insert[],
  transaction: DbTransaction
) => {
  return bulkInsertOrDoNothingUsageEvents(
    usageEventInserts,
    [usageEvents.transactionId],
    transaction
  )
}
