import { eq, inArray } from 'drizzle-orm'
import {
  webhooks,
  webhooksInsertSchema,
  webhooksSelectSchema,
  webhooksTableRowDataSchema,
  webhooksUpdateSchema,
} from '@/db/schema/webhooks'
import {
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import { pricingModels } from '../schema/pricingModels'
import type { DbTransaction } from '../types'

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
    async (data, transaction) => {
      // Get unique pricing model IDs from webhooks
      const pricingModelIds = [
        ...new Set(data.map((w) => w.pricingModelId)),
      ]

      // Fetch pricing model names in bulk
      const pricingModelRecords =
        pricingModelIds.length > 0
          ? await transaction
              .select({
                id: pricingModels.id,
                name: pricingModels.name,
              })
              .from(pricingModels)
              .where(inArray(pricingModels.id, pricingModelIds))
          : []

      // Create a map for quick lookup
      const pricingModelNameMap = new Map(
        pricingModelRecords.map((pm) => [pm.id, pm.name])
      )

      return data.map((webhook) => ({
        webhook,
        pricingModelName:
          pricingModelNameMap.get(webhook.pricingModelId) ?? null,
      }))
    }
  )
