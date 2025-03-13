import { z } from 'zod'
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import {
  enhancedCreateInsertSchema,
  tableBase,
  constructIndex,
  createUpdateSchema,
  newBaseZodSelectSchemaColumns,
  notNullStringForeignKey,
} from '@/db/tableUtils'
import { integrations } from '@/db/schema/integrations'
import { IdNumberParam } from '@/types'
import core from '@/utils/core'

const TABLE_NAME = 'integration_sessions'

export const integrationSessions = pgTable(
  TABLE_NAME,
  {
    ...tableBase('integrationSession'),
    IntegrationId: notNullStringForeignKey(
      'integration_id',
      integrations
    ),
    state: text('state').notNull(),
    codeVerifier: text('code_verifier'),
    redirectUrl: text('redirect_url').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    metadata: jsonb('metadata'),
  },
  (table) => {
    return [
      constructIndex(TABLE_NAME, [table.IntegrationId]),
      constructIndex(TABLE_NAME, [table.state]),
    ]
  }
).enableRLS()

const integrationSessionRefinementColumns = {
  expiresAt: core.safeZodDate,
}

export const integrationSessionsInsertSchema =
  enhancedCreateInsertSchema(
    integrationSessions,
    integrationSessionRefinementColumns
  )

export const integrationSessionsSelectSchema = createSelectSchema(
  integrationSessions,
  {
    ...newBaseZodSelectSchemaColumns,
    ...integrationSessionRefinementColumns,
  }
)

export const integrationSessionsUpdateSchema = createUpdateSchema(
  integrationSessions,
  {
    ...newBaseZodSelectSchemaColumns,
    ...integrationSessionRefinementColumns,
  }
)

export const createIntegrationSessionInputSchema = z.object({
  integrationSession: integrationSessionsInsertSchema,
})
export type CreateIntegrationSessionInput = z.infer<
  typeof createIntegrationSessionInputSchema
>

export const editIntegrationSessionInputSchema = z.object({
  integrationSession: integrationSessionsUpdateSchema,
})
export type EditIntegrationSessionInput = z.infer<
  typeof editIntegrationSessionInputSchema
>

export namespace IntegrationSession {
  export type Insert = z.infer<typeof integrationSessionsInsertSchema>
  export type Update = z.infer<typeof integrationSessionsUpdateSchema>
  export type Record = z.infer<typeof integrationSessionsSelectSchema>
}
