import {
  type Event,
  events,
  eventsInsertSchema,
  eventsSelectSchema,
  eventsUpdateSchema,
} from '@/db/schema/events'
import {
  createBulkInsertOrDoNothingFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '../types'

const config: ORMMethodCreatorConfig<
  typeof events,
  typeof eventsSelectSchema,
  typeof eventsInsertSchema,
  typeof eventsUpdateSchema
> = {
  selectSchema: eventsSelectSchema,
  insertSchema: eventsInsertSchema,
  updateSchema: eventsUpdateSchema,
  tableName: 'events',
}

export const selectEventById = createSelectById(events, config)

export const insertEvent = createInsertFunction(events, config)

export const updateEvent = createUpdateFunction(events, config)

export const selectEvents = createSelectFunction(events, config)

export const upsertEventByHash = createUpsertFunction(
  events,
  [events.hash],
  config
)

export const bulkInsertOrDoNothingEvents =
  createBulkInsertOrDoNothingFunction(events, config)

export function bulkInsertOrDoNothingEventsByHash(
  eventInserts: Event.Insert[],
  transaction: DbTransaction
) {
  return bulkInsertOrDoNothingEvents(
    eventInserts,
    [events.hash],
    transaction
  )
}
