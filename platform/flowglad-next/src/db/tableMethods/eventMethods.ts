import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createUpsertFunction,
} from '@/db/tableUtils'
import {
  events,
  eventsInsertSchema,
  eventsSelectSchema,
  eventsUpdateSchema,
} from '@/db/schema/events'

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
