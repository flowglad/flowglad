import { Unkey } from '@unkey/api'
import core from './core'
import { Organization } from '@/db/schema/organizations'
import { ApiEnvironment, FlowgladApiKeyType } from '@/types'
import { ApiKey } from '@/db/schema/apiKeys'
import { encrypt } from './encryption'
import { kebabCase } from 'change-case'
import * as R from 'ramda'

const unkey = () =>
  new Unkey({
    rootKey: core.envVariable('UNKEY_ROOT_KEY'),
  })

export const verifyApiKey = async (apiKey: string) => {
  const { result, error } = await unkey().keys.verify({
    apiId: core.envVariable('UNKEY_API_ID'),
    key: apiKey,
  })
  if (error) {
    throw error
  }
  return {
    keyId: result.keyId,
    valid: result.valid,
    organizationId: result.ownerId,
    environment: result.environment as ApiEnvironment,
  }
}

interface CreateApiKeyParams {
  name: string
  apiEnvironment: ApiEnvironment
  organization: Organization.Record
  userId: string
  type: FlowgladApiKeyType
  expiresAt?: Date
  stackAuthHostedBillingUserId?: string
}

interface CreateApiKeyResult {
  apiKeyInsert: ApiKey.Insert
  shownOnlyOnceKey: string
}

export const createApiKey = async (
  params: CreateApiKeyParams
): Promise<CreateApiKeyResult> => {
  if (params.type === FlowgladApiKeyType.Publishable) {
    throw new Error(
      'Publishable keys are not supported at this time.'
    )
  }

  const { organization, apiEnvironment } = params

  const maybeStagingPrefix = core.IS_PROD ? '' : 'staging_'
  const maybeBillingPortalPrefix =
    params.type === FlowgladApiKeyType.BillingPortalToken
      ? 'billing_portal_'
      : ''
  const { result, error } = await unkey().keys.create({
    apiId: core.envVariable('UNKEY_API_ID'),
    name: `${organization.id} / ${apiEnvironment} / ${params.name}`,
    environment: apiEnvironment,
    expires: params.expiresAt?.getTime(),
    externalId: organization.id,
    prefix: [
      maybeStagingPrefix,
      maybeBillingPortalPrefix,
      'sk_',
      apiEnvironment,
    ].join(''),
    meta: {
      userId: params.userId,
    },
  })

  if (error) {
    throw error
  }
  const livemode = params.apiEnvironment === 'live'
  /**
   * Hide the key in live mode
   */
  const token = livemode
    ? `sk_live_...${result.key.slice(-4)}`
    : result.key
  const coreApiKeyInsert: Pick<
    ApiKey.Insert,
    | 'organizationId'
    | 'name'
    | 'token'
    | 'livemode'
    | 'active'
    | 'unkeyId'
  > = {
    organizationId: params.organization.id,
    name: params.name,
    token,
    livemode,
    active: true,
    unkeyId: result.keyId,
  }
  if (params.type === FlowgladApiKeyType.BillingPortalToken) {
    if (!params.stackAuthHostedBillingUserId) {
      throw new Error(
        'stackAuthHostedBillingUserId is required for billing portal tokens'
      )
    }

    if (!params.expiresAt) {
      throw new Error(
        'expiresAt is required for billing portal tokens'
      )
    }

    return {
      apiKeyInsert: {
        ...coreApiKeyInsert,
        stackAuthHostedBillingUserId:
          params.stackAuthHostedBillingUserId,
        expiresAt: params.expiresAt,
        type: FlowgladApiKeyType.BillingPortalToken,
      },
      shownOnlyOnceKey: result.key,
    }
  }

  return {
    apiKeyInsert: {
      ...coreApiKeyInsert,
      type: FlowgladApiKeyType.Secret,
      expiresAt: params.expiresAt,
      stackAuthHostedBillingUserId:
        params.stackAuthHostedBillingUserId ?? null,
    },
    shownOnlyOnceKey: result.key,
  }
}

interface ReplaceApiKeyParams {
  organization: Organization.Record
  oldApiKey: ApiKey.Record
  userId: string
}

export const replaceApiKey = async (
  params: ReplaceApiKeyParams
): Promise<{
  apiKeyInsert: ApiKey.Insert
  shownOnlyOnceKey: string
}> => {
  // Create new key with same settings
  const newApiKey = await createApiKey({
    name: params.oldApiKey.name,
    apiEnvironment: params.oldApiKey.livemode ? 'live' : 'test',
    organization: params.organization,
    userId: params.userId,
    type: params.oldApiKey.type,
  })

  return {
    apiKeyInsert: newApiKey.apiKeyInsert,
    shownOnlyOnceKey: newApiKey.shownOnlyOnceKey,
  }
}

export const deleteApiKey = async (keyId: string) => {
  await unkey().keys.delete({
    keyId,
  })
}
