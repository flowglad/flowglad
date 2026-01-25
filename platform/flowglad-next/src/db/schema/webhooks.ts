import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { organizations } from '@/db/schema/organizations'
import { pricingModels } from '@/db/schema/pricingModels'
import {
  constructIndex,
  livemodePolicyTable,
  merchantPolicy,
  notNullStringForeignKey,
  orgIdEqualsCurrentSQL,
  tableBase,
} from '@/db/tableUtils'
import { FlowgladEventType } from '@/types'
import { buildSchemas } from '../createZodSchemas'

const TABLE_NAME = 'webhooks'

export const webhookFilterTypes = z
  .enum(FlowgladEventType)
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
    pricingModelId: notNullStringForeignKey(
      'pricing_model_id',
      pricingModels
    ),
  },
  livemodePolicyTable(TABLE_NAME, (table) => [
    constructIndex(TABLE_NAME, [table.organizationId]),
    constructIndex(TABLE_NAME, [table.active]),
    constructIndex(TABLE_NAME, [table.pricingModelId]),
    merchantPolicy(
      `Enable read for own organizations (${TABLE_NAME})`,
      {
        as: 'permissive',
        for: 'all',
        using: orgIdEqualsCurrentSQL(),
      }
    ),
  ])
).enableRLS()

const columnRefinements = {
  filterTypes: webhookFilterTypes,
  url: z.string().url(),
}

const readOnlyColumns = {
  livemode: true,
  organizationId: true,
} as const

const createOnlyColumns = {
  pricingModelId: true,
} as const

const hiddenColumns = {} as const

export const {
  insert: webhooksInsertSchema,
  select: webhooksSelectSchema,
  update: webhooksUpdateSchema,
  client: {
    insert: webhookClientInsertSchema,
    select: webhookClientSelectSchema,
    update: webhookClientUpdateSchema,
  },
} = buildSchemas(webhooks, {
  refine: columnRefinements,
  client: {
    hiddenColumns,
    readOnlyColumns,
    createOnlyColumns,
  },
})

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

export const webhooksTableRowDataSchema = z.object({
  webhook: webhookClientSelectSchema,
})
