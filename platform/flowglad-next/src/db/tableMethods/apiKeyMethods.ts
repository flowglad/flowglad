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
  createDeleteFunction,
  createInsertFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { zodEpochMs } from '../timestampMs'
import { selectOrganizations } from './organizationMethods'
import { selectPricingModels } from './pricingModelMethods'

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

export const deleteApiKey = createDeleteFunction(apiKeys)

export const selectApiKeys = createSelectFunction(apiKeys, config)

const apiKeyWithOrganizationSchema = z.object({
  apiKey: apiKeysClientSelectSchema,
  organization: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: zodEpochMs,
    updatedAt: zodEpochMs.nullable().optional(),
  }),
  pricingModel: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

const enrichApiKeysWithOrganizations = async (
  data: z.infer<typeof apiKeysClientSelectSchema>[],
  transaction: DbTransaction
) => {
  const organizationIds = data.map((item) => item.organizationId)
  const pricingModelIds = data.map((item) => item.pricingModelId)

  const [orgs, pricingModelsData] = await Promise.all([
    selectOrganizations({ id: organizationIds }, transaction),
    selectPricingModels({ id: pricingModelIds }, transaction),
  ])

  const orgsById = new Map(orgs.map((org) => [org.id, org]))
  const pricingModelsById = new Map(
    pricingModelsData.map((pm) => [pm.id, pm])
  )

  return data.map((apiKey) => {
    const organization = orgsById.get(apiKey.organizationId)
    if (!organization) {
      throw new Error(
        `Organization not found for API key ${apiKey.id}`
      )
    }
    const pricingModel = pricingModelsById.get(apiKey.pricingModelId)
    if (!pricingModel) {
      throw new Error(
        `Pricing model not found for API key ${apiKey.id}`
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
      pricingModel: {
        id: pricingModel.id,
        name: pricingModel.name,
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
