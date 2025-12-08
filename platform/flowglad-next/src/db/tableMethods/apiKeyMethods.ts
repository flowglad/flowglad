import { z } from 'zod'
import {
  apiKeys,
  apiKeysClientSelectSchema,
  apiKeysInsertSchema,
  apiKeysSelectSchema,
  apiKeysUpdateSchema,
} from '@/db/schema/apiKeys'
import {
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { zodEpochMs } from '../timestampMs'
import { selectOrganizations } from './organizationMethods'

const config: ORMMethodCreatorConfig<
  typeof apiKeys,
  typeof apiKeysSelectSchema,
  typeof apiKeysInsertSchema,
  typeof apiKeysUpdateSchema
> = {
  selectSchema: apiKeysSelectSchema,
  insertSchema: apiKeysInsertSchema,
  updateSchema: apiKeysUpdateSchema,
  tableName: 'api_keys',
}

export const selectApiKeyById = createSelectById(apiKeys, config)

export const insertApiKey = createInsertFunction(apiKeys, config)

export const updateApiKey = createUpdateFunction(apiKeys, config)

export const selectApiKeys = createSelectFunction(apiKeys, config)

const apiKeyWithOrganizationSchema = z.object({
  apiKey: apiKeysClientSelectSchema,
  organization: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: zodEpochMs,
    updatedAt: zodEpochMs.nullable().optional(),
  }),
})

const enrichApiKeysWithOrganizations = async (
  data: z.infer<typeof apiKeysClientSelectSchema>[],
  transaction: DbTransaction
) => {
  const organizationIds = data.map((item) => item.organizationId)
  const orgs = await selectOrganizations(
    { id: organizationIds },
    transaction
  )
  const orgsById = new Map(orgs.map((org) => [org.id, org]))

  return data.map((apiKey) => {
    const organization = orgsById.get(apiKey.organizationId)
    if (!organization) {
      throw new Error(
        `Organization not found for API key ${apiKey.id}`
      )
    }
    return {
      apiKey,
      organization: {
        id: organization.id,
        name: organization.name,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      },
    }
  })
}

export const selectApiKeysTableRowData =
  createCursorPaginatedSelectFunction(
    apiKeys,
    config,
    apiKeyWithOrganizationSchema,
    enrichApiKeysWithOrganizations
  )
