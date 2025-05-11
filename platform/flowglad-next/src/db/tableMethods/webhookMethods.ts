import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  webhooks,
  webhooksInsertSchema,
  webhooksSelectSchema,
  webhooksUpdateSchema,
} from '@/db/schema/webhooks'

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
