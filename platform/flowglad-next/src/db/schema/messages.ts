import { createSelectSchema } from 'drizzle-zod'
import {
  enhancedCreateInsertSchema,
  newBaseZodSelectSchemaColumns,
  constructIndex,
  constructUniqueIndex,
  tableBase,
  nullableStringForeignKey,
  createUpdateSchema,
  livemodePolicy,
} from '@/db/tableUtils'
import core from '@/utils/core'
import { z } from 'zod'
import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { customerProfiles } from './customerProfiles'
import { memberships } from './memberships'

const TABLE_NAME = 'messages'
export const messages = pgTable(
  TABLE_NAME,
  {
    ...tableBase('msg'),
    customerProfileId: nullableStringForeignKey(
      'customer_profile_id',
      customerProfiles
    ),
    messageSentAt: timestamp('message_sent_at').notNull(),
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
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  ...newBaseZodSelectSchemaColumns,
  messageSentAt: core.safeZodDate,
  payload: z.unknown(),
}

export const messagesSelectSchema = createSelectSchema(
  messages,
  columnRefinements
)

export const messagesInsertSchema = enhancedCreateInsertSchema(
  messages,
  columnRefinements
)

export const messagesUpdateSchema = createUpdateSchema(
  messages,
  columnRefinements
)

const readOnlyColumns = {
  customerProfileId: true,
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
} as const

const hiddenColumns = {} as const

export const messagesClientSelectSchema =
  messagesSelectSchema.omit(hiddenColumns)

export const messagesClientUpdateSchema =
  messagesInsertSchema.omit(readOnlyColumns)

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
}
