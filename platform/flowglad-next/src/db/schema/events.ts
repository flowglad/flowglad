import {
  jsonb,
  text,
  timestamp,
  pgTable,
  pgPolicy,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import {
  constructIndex,
  enhancedCreateInsertSchema,
  pgEnumColumn,
  constructUniqueIndex,
  createUpdateSchema,
  tableBase,
  nullableStringForeignKey,
  livemodePolicy,
} from '@/db/tableUtils'
import {
  FlowgladEventType,
  EventCategory,
  EventRetentionPolicy,
  EventNoun,
} from '@/types'
import core from '@/utils/core'
import { createSelectSchema } from 'drizzle-zod'
import { integer } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organizations } from './organizations'

const TABLE_NAME = 'Events'

export const events = pgTable(
  TABLE_NAME,
  {
    ...tableBase('event'),
    type: pgEnumColumn({
      enumName: 'FlowgladEventType',
      columnName: 'type',
      enumBase: FlowgladEventType,
    }).notNull(),
    eventCategory: pgEnumColumn({
      enumName: 'EventCategory',
      columnName: 'eventCategory',
      enumBase: EventCategory,
    }).notNull(),
    eventRetentionPolicy: pgEnumColumn({
      enumName: 'EventRetentionPolicy',
      columnName: 'eventRetentionPolicy',
      enumBase: EventRetentionPolicy,
    }).notNull(),
    rawPayload: jsonb('rawPayload').notNull(),
    occurredAt: timestamp('occurredAt').notNull(),
    submittedAt: timestamp('submittedAt').notNull(),
    processedAt: timestamp('processedAt'),
    metadata: jsonb('metadata').notNull(),
    source: text('source').notNull(),
    subjectEntity: pgEnumColumn({
      enumName: 'EventNoun',
      columnName: 'subjectEntity',
      enumBase: EventNoun,
    }),
    subjectId: integer('subjectId'),
    objectEntity: pgEnumColumn({
      enumName: 'EventNoun',
      columnName: 'objectEntity',
      enumBase: EventNoun,
    }),
    objectId: integer('objectId'),
    hash: text('hash').notNull().unique(),
    organizationId: nullableStringForeignKey(
      'organization_id',
      organizations
    ).notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.type]),
      constructIndex(TABLE_NAME, [table.eventCategory]),
      constructIndex(TABLE_NAME, [table.eventRetentionPolicy]),
      constructIndex(TABLE_NAME, [table.subjectEntity]),
      constructIndex(TABLE_NAME, [table.objectEntity]),
      constructIndex(TABLE_NAME, [
        table.subjectEntity,
        table.subjectId,
      ]),
      constructIndex(TABLE_NAME, [
        table.objectEntity,
        table.objectId,
      ]),
      constructUniqueIndex(TABLE_NAME, [table.hash]),
      livemodePolicy(),
      pgPolicy('Enable all actions for own organization', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"organizationId" in (select "organizationId" from "Memberships")`,
      }),
    ]
  }
).enableRLS()

const columnRefinements = {
  type: core.createSafeZodEnum(FlowgladEventType),
  eventCategory: core.createSafeZodEnum(EventCategory),
  eventRetentionPolicy: core.createSafeZodEnum(EventRetentionPolicy),
  processedAt: core.safeZodDate.nullable(),
  subjectEntity: core.createSafeZodEnum(EventNoun).nullable(),
  objectEntity: core.createSafeZodEnum(EventNoun).nullable(),
  subjectId: core.safeZodPositiveInteger.nullable(),
  objectId: core.safeZodPositiveInteger.nullable(),
}

export const eventsInsertSchema = enhancedCreateInsertSchema(
  events,
  columnRefinements
).extend(columnRefinements)

export const eventsSelectSchema =
  createSelectSchema(events).extend(columnRefinements)

export const eventsUpdateSchema = createUpdateSchema(
  events,
  columnRefinements
)

export namespace Event {
  export type Insert = z.infer<typeof eventsInsertSchema>
  export type Update = z.infer<typeof eventsUpdateSchema>
  export type Record = z.infer<typeof eventsSelectSchema>
}
