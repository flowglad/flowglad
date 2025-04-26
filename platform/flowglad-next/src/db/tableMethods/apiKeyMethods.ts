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
  apiKeysClientSelectSchema,
  apiKeysInsertSchema,
  apiKeysSelectSchema,
  apiKeysUpdateSchema,
} from '@/db/schema/apiKeys'
import { eq, desc, and, lt } from 'drizzle-orm'
import { DbTransaction } from '@/db/types'
import { organizations } from '../schema/organizations'
import { FlowgladApiKeyType } from '@/types'
import core from '@/utils/core'

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
    apiKey: apiKeysClientSelectSchema.parse(row.apiKey),
    organization: row.organization,
  }))
}

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
