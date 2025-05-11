import {
  boolean,
  text,
  pgTable,
  pgPolicy,
  jsonb,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import {
  tableBase,
  notNullStringForeignKey,
  constructIndex,
  enhancedCreateInsertSchema,
  livemodePolicy,
  ommittedColumnsForInsertSchema,
  createUpdateSchema,
} from '@/db/tableUtils'
import { organizations } from '@/db/schema/organizations'
import { createSelectSchema } from 'drizzle-zod'
import { FlowgladEventType } from '@/types'

const TABLE_NAME = 'webhooks'

export const webhookFilterTypes = z
  .nativeEnum(FlowgladEventType)
  .array()
  .describe(
    'The list of event types for which this webhook will receive events.'
  )

export const webhooks = pgTable(
  TABLE_NAME,
  {
    ...tableBase('webhook'),
    filterTypes: jsonb('event_subscriptions').notNull(),
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    url: text('url').notNull(),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.organizationId]),
      constructIndex(TABLE_NAME, [table.active]),
      pgPolicy('Enable read for own organizations', {
        as: 'permissive',
        to: 'authenticated',
        for: 'all',
        using: sql`"organization_id" in (select "organization_id" from "memberships")`,
      }),
      livemodePolicy(),
    ]
  }
).enableRLS()

const columnRefinements = {
  filterTypes: webhookFilterTypes,
  url: z.string().url(),
}

/*
 * database schema
 */
export const webhooksInsertSchema = enhancedCreateInsertSchema(
  webhooks,
  columnRefinements
).extend(columnRefinements)

export const webhooksSelectSchema =
  createSelectSchema(webhooks).extend(columnRefinements)

export const webhooksUpdateSchema = createUpdateSchema(
  webhooks,
  columnRefinements
).extend(columnRefinements)

const readOnlyColumns = {
  livemode: true,
} as const

const hiddenColumns = {
  ...ommittedColumnsForInsertSchema,
} as const

const nonClientEditableColumns = {
  ...readOnlyColumns,
  organizationId: true,
} as const

/*
 * client schemas
 */
export const webhookClientInsertSchema = webhooksInsertSchema.omit(
  nonClientEditableColumns
)

export const webhookClientUpdateSchema = webhooksUpdateSchema.omit(
  nonClientEditableColumns
)

export const webhookClientSelectSchema =
  webhooksSelectSchema.omit(hiddenColumns)

export namespace Webhook {
  export type Insert = z.infer<typeof webhooksInsertSchema>
  export type Update = z.infer<typeof webhooksUpdateSchema>
  export type Record = z.infer<typeof webhooksSelectSchema>
  export type ClientInsert = z.infer<typeof webhookClientInsertSchema>
  export type ClientUpdate = z.infer<typeof webhookClientUpdateSchema>
  export type ClientRecord = z.infer<typeof webhookClientSelectSchema>
  export type FilterTypes = z.infer<typeof webhookFilterTypes>
}

export const createWebhookInputSchema = z.object({
  webhook: webhookClientInsertSchema,
})

export type CreateWebhookInput = z.infer<
  typeof createWebhookInputSchema
>

export const editWebhookInputSchema = z.object({
  id: z.string(),
  webhook: webhookClientUpdateSchema,
})

export type EditWebhookInput = z.infer<typeof editWebhookInputSchema>
