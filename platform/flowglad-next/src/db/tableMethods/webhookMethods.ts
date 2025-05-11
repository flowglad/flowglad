import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
  createCursorPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  webhooks,
  webhooksInsertSchema,
  webhooksSelectSchema,
  webhooksTableRowDataSchema,
  webhooksUpdateSchema,
} from '@/db/schema/webhooks'
import { eq } from 'drizzle-orm'
import { DbTransaction } from '../types'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'

const config: ORMMethodCreatorConfig<
  typeof webhooks,
  typeof webhooksSelectSchema,
  typeof webhooksInsertSchema,
  typeof webhooksUpdateSchema
> = {
  tableName: 'webhooks',
  selectSchema: webhooksSelectSchema,
  insertSchema: webhooksInsertSchema,
  updateSchema: webhooksUpdateSchema,
}

export const selectWebhookById = createSelectById(webhooks, config)

export const insertWebhook = createInsertFunction(webhooks, config)

export const updateWebhook = createUpdateFunction(webhooks, config)

export const selectWebhooks = createSelectFunction(webhooks, config)

export const selectWebhookAndOrganizationByWebhookId = async (
  id: string,
  transaction: DbTransaction
) => {
  const result = await transaction
    .select({
      webhook: webhooks,
      organization: organizations,
    })
    .from(webhooks)
    .leftJoin(
      organizations,
      eq(webhooks.organizationId, organizations.id)
    )
    .where(eq(webhooks.id, id))
  return {
    webhook: webhooksSelectSchema.parse(result[0].webhook),
    organization: organizationsSelectSchema.parse(
      result[0].organization
    ),
  }
}

export const selectWebhooksTableRowData =
  createCursorPaginatedSelectFunction(
    webhooks,
    config,
    webhooksTableRowDataSchema,
    async (data) => {
      return data.map((webhook) => ({
        webhook,
      }))
    }
  )
