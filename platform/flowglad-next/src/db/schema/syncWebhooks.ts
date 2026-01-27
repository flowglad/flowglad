import {
  boolean,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { organizations } from '@/db/schema/organizations'
import {
  constructIndex,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  orgIdEqualsCurrentSQL,
  tableBase,
} from '@/db/tableUtils'
import { buildSchemas } from '../createZodSchemas'

const TABLE_NAME = 'sync_webhooks'

/**
 * Sync webhooks table for storing webhook configurations for sync notifications.
 *
 * Each record represents a webhook endpoint that receives sync notifications
 * for a specific organization + livemode scope.
 */
export const syncWebhooks = pgTable(
  TABLE_NAME,
  {
    ...tableBase('sync_webhook'),
    /** Organization this webhook belongs to */
    organizationId: notNullStringForeignKey(
      'organization_id',
      organizations
    ),
    /** The webhook endpoint URL (must be HTTPS in production) */
    url: text('url').notNull(),
    /**
     * The signing secret used to sign outgoing webhooks.
     * Stored as plaintext since we need it to sign requests.
     * 64-character hex string (32 bytes).
     */
    signingSecret: text('signing_secret').notNull(),
    /** Whether this webhook is active and should receive notifications */
    active: boolean('active').notNull().default(true),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.active]),
    // Unique constraint: one webhook per org+livemode
    uniqueIndex(
      'sync_webhooks_organization_id_livemode_unique_idx'
    ).on(table.organizationId, table.livemode),
    merchantPolicy(
      `Enable all for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const columnRefinements = {
  url: z.string().url(),
  signingSecret: z.string().length(64),
}

const readOnlyColumns = {
  organizationId: true,
  livemode: true,
} as const

const hiddenColumns = {
  signingSecret: true,
} as const

const createOnlyColumns = {} as const

export const {
  insert: syncWebhooksInsertSchema,
  select: syncWebhooksSelectSchema,
  update: syncWebhooksUpdateSchema,
  client: {
    insert: syncWebhookClientInsertSchema,
    select: syncWebhookClientSelectSchema,
    update: syncWebhookClientUpdateSchema,
  },
} = buildSchemas(syncWebhooks, {
  refine: columnRefinements,
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
})

export namespace SyncWebhook {
  export type Insert = z.infer<typeof syncWebhooksInsertSchema>
  export type Update = z.infer<typeof syncWebhooksUpdateSchema>
  export type Record = z.infer<typeof syncWebhooksSelectSchema>
  export type ClientInsert = z.infer<
    typeof syncWebhookClientInsertSchema
  >
  export type ClientUpdate = z.infer<
    typeof syncWebhookClientUpdateSchema
  >
  export type ClientRecord = z.infer<
    typeof syncWebhookClientSelectSchema
  >
}
