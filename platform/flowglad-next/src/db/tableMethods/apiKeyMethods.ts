import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createCursorPaginatedSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  ApiKey,
  apiKeys,
  apiKeysClientSelectSchema,
  apiKeysInsertSchema,
  apiKeysSelectSchema,
  apiKeysUpdateSchema,
} from '@/db/schema/apiKeys'
import { eq, and, lt } from 'drizzle-orm'
import { DbTransaction } from '@/db/types'
import { FlowgladApiKeyType } from '@/types'
import { z } from 'zod'
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
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
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

export const safelyFilterExpiredBillingPortalApiKeys = (
  expiredApiKeys: ApiKey.Record[]
) => {
  const extraSafeExpiredOnlyBillingPortalKeys = expiredApiKeys
    .filter(
      (key) => key.type === FlowgladApiKeyType.BillingPortalToken
    )
    .filter(
      (key) =>
        key.expiresAt &&
        key.expiresAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    )
  return extraSafeExpiredOnlyBillingPortalKeys
}

export const select7DaysExpiredBillingPortalApiKeys = async (
  transaction: DbTransaction
) => {
  const expiredBillingPortalApiKeys = await transaction
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.type, FlowgladApiKeyType.BillingPortalToken),
        lt(
          apiKeys.expiresAt,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        )
      )
    )

  return safelyFilterExpiredBillingPortalApiKeys(
    expiredBillingPortalApiKeys.map((row) => {
      return apiKeysSelectSchema.parse(row)
    })
  )
}
