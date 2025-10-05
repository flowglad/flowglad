import * as R from 'ramda'
import { buildSchemas } from '@/db/createZodSchemas'
import {
  newBaseZodSelectSchemaColumns,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  nullableStringForeignKey,
  livemodePolicy,
  SelectConditions,
  hiddenColumnsForClientSchema,
  timestampWithTimezoneColumn,
} from '@/db/tableUtils'
import core from '@/utils/core'
import { z } from 'zod'
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { customers } from './customers'
import { memberships } from './memberships'

const TABLE_NAME = 'messages'
export const messages = pgTable(
  TABLE_NAME,
  {
    ...tableBase('msg'),
    customerId: nullableStringForeignKey('customer_id', customers),
    messageSentAt:
      timestampWithTimezoneColumn('message_sent_at').notNull(),
    organizationMemberId: nullableStringForeignKey(
      'organization_member_id',
      memberships
    ),
    rawText: text('raw_text').notNull(),
    platform: text('platform').notNull(),
    /**
     * For Figma, there isn't really a notion of "thread"
     * For Slack, this is the thread
     * For Gmail, this is the thread
     */
    platformThreadId: text('platform_thread_id'),
    /**
     * For Figma, this is the file
     * For Slack, this is the literal channel
     */
    platformChannelId: text('platform_channel_id'),
    platformId: text('platform_id').notNull(),
    platformUserId: text('platform_user_id').notNull(),
    payload: jsonb('payload'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.platformId]),
      constructIndex(TABLE_NAME, [table.platformThreadId]),
      constructUniqueIndex(TABLE_NAME, [
        table.platformId,
        table.platform,
      ]),
      livemodePolicy(TABLE_NAME),
    ]
  }
).enableRLS()

// Common refinements for both SELECT and INSERT schemas
const commonColumnRefinements = {
  payload: z.unknown(),
}

export const {
  select: messagesSelectSchema,
  insert: messagesInsertSchema,
  update: messagesUpdateSchema,
  client: {
    select: messagesClientSelectSchema,
    update: messagesClientUpdateSchema,
  },
} = buildSchemas(messages, {
  refine: {
    ...commonColumnRefinements,
  },
  selectRefine: {
    ...newBaseZodSelectSchemaColumns,
  },
  client: {
    hiddenColumns: {
      ...hiddenColumnsForClientSchema,
    },
    readOnlyColumns: {
      customerId: true,
      organizationMemberId: true,
      platformId: true,
      platformUserId: true,
      platformThreadId: true,
      platformChannelId: true,
      rawText: true,
      platform: true,
      payload: true,
      messageSentAt: true,
      livemode: true,
    },
    createOnlyColumns: {},
  },
  entityName: 'Messages',
})

export namespace Message {
  export type Insert = z.infer<typeof messagesInsertSchema>
  export type Update = z.infer<typeof messagesUpdateSchema>
  export type Record = z.infer<typeof messagesSelectSchema>
  export type ClientRecord = z.infer<
    typeof messagesClientSelectSchema
  >
  export type ClientUpdate = z.infer<
    typeof messagesClientUpdateSchema
  >
  export type Where = SelectConditions<typeof messages>
}
