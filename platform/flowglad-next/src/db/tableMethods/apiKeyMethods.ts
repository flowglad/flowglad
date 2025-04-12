import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  ApiKey,
  apiKeys,
  apiKeysInsertSchema,
  apiKeysSelectSchema,
  apiKeysUpdateSchema,
} from '@/db/schema/apiKeys'
import { eq, desc } from 'drizzle-orm'
import { DbTransaction } from '@/db/types'
import { organizations } from '../schema/organizations'

const config: ORMMethodCreatorConfig<
  typeof apiKeys,
  typeof apiKeysSelectSchema,
  typeof apiKeysInsertSchema,
  typeof apiKeysUpdateSchema
> = {
  selectSchema: apiKeysSelectSchema,
  insertSchema: apiKeysInsertSchema,
  updateSchema: apiKeysUpdateSchema,
}

export const selectApiKeyById = createSelectById(apiKeys, config)

export const insertApiKey = createInsertFunction(apiKeys, config)

export const updateApiKey = createUpdateFunction(apiKeys, config)

export const selectApiKeys = createSelectFunction(apiKeys, config)

export const selectApiKeysTableRowData = async (
  organizationId: string,
  transaction: DbTransaction
) => {
  const apiKeysRowData = await transaction
    .select({
      apiKey: apiKeys,
      organization: organizations,
    })
    .from(apiKeys)
    .innerJoin(
      organizations,
      eq(apiKeys.organizationId, organizations.id)
    )
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt))

  return apiKeysRowData.map((row) => ({
    apiKey: row.apiKey,
    organization: row.organization,
  }))
}
