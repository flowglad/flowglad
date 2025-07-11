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
  SelectConditions,
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

const TABLE_NAME = 'events'

export const events = pgTable(
  TABLE_NAME,
  {
    ...tableBase('event'),
    type: pgEnumColumn({
      enumName: 'FlowgladEventType',
      columnName: 'type',
      enumBase: FlowgladEventType,
    }).notNull(),
    // eventCategory: pgEnumColumn({
    //   enumName: 'EventCategory',
    //   columnName: 'event_category',
    //   enumBase: EventCategory,
    // }).notNull(),
    // eventRetentionPolicy: pgEnumColumn({
    //   enumName: 'EventRetentionPolicy',
    //   columnName: 'event_retention_policy',
    //   enumBase: EventRetentionPolicy,
    // }).notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    submittedAt: timestamp('submitted_at').notNull(),
    processedAt: timestamp('processed_at'),
    metadata: jsonb('metadata').notNull(),
    // source: text('source').notNull(),
    // subjectEntity: pgEnumColumn({
    //   enumName: 'EventNoun',
    //   columnName: 'subject_entity',
    //   enumBase: EventNoun,
    // }),
    // subjectId: integer('subject_id'),
    objectEntity: pgEnumColumn({
      enumName: 'EventNoun',
      columnName: 'object_entity',
      enumBase: EventNoun,
    }),
    objectId: integer('object_id'),
    hash: text('hash').notNull().unique(),
    organizationId: nullableStringForeignKey(
      'organization_id',
      organizations
    ).notNull(),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.type]),
      // constructIndex(TABLE_NAME, [table.eventCategory]),
      // constructIndex(TABLE_NAME, [table.eventRetentionPolicy]),
      // constructIndex(TABLE_NAME, [table.subjectEntity]),
      constructIndex(TABLE_NAME, [table.objectEntity]),
      // constructIndex(TABLE_NAME, [
      //   table.subjectEntity,
      //   table.subjectId,
      // ]),
      constructIndex(TABLE_NAME, [
        table.objectEntity,
        table.objectId,
      ]),
      constructUniqueIndex(TABLE_NAME, [table.hash]),
      livemodePolicy(),
      pgPolicy('Enable insert for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'insert',
        withCheck: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      pgPolicy('Enable all actions for own organization', {
        as: 'permissive',
        to: 'authenticated',
        for: 'select',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
    ]
  }
).enableRLS()

export const eventPayloadSchema = z.object({
  id: z.string(),
  object: z.nativeEnum(EventNoun),
})

const columnRefinements = {
  type: core.createSafeZodEnum(FlowgladEventType),
  // eventCategory: core.createSafeZodEnum(EventCategory),
  // eventRetentionPolicy: core.createSafeZodEnum(EventRetentionPolicy),
  processedAt: core.safeZodDate.nullable(),
  payload: eventPayloadSchema,
  // subjectEntity: core.createSafeZodEnum(EventNoun).nullable(),
  // objectEntity: core.createSafeZodEnum(EventNoun).nullable(),
  // subjectId: core.safeZodPositiveInteger.nullable(),
  // objectId: core.safeZodPositiveInteger.nullable(),
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
  export type Where = SelectConditions<typeof events>
  export type EventfulResult<T> = [T, Insert[]]
}
