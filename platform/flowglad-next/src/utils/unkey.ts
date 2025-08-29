import { Unkey } from '@unkey/api'
import core from './core'
import { Organization } from '@/db/schema/organizations'
import { ApiEnvironment, FlowgladApiKeyType } from '@/types'
import {
  ApiKey,
  billingPortalApiKeyMetadataSchema,
  secretApiKeyMetadataSchema,
  apiKeyMetadataSchema,
} from '@/db/schema/apiKeys'

export const unkey = () =>
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
    ownerId: result.ownerId,
    environment: result.environment as ApiEnvironment,
  }
}

export interface StandardCreateApiKeyParams {
  name: string
  apiEnvironment: ApiEnvironment
  organization: Pick<Organization.Record, 'id'>
  userId: string
  type: FlowgladApiKeyType.Secret
  expiresAt?: Date
}

export interface BillingPortalCreateApiKeyParams
  extends Omit<StandardCreateApiKeyParams, 'type'> {
  type: FlowgladApiKeyType.BillingPortalToken
  stackAuthHostedBillingUserId: string
  expiresAt: Date
}

interface CreateApiKeyResult {
  apiKeyInsert: ApiKey.Insert
  shownOnlyOnceKey: string
}

type UnkeyInput = Parameters<
  ReturnType<typeof unkey>['keys']['create']
>[0]

export const secretApiKeyInputToUnkeyInput = (
  params: StandardCreateApiKeyParams
): UnkeyInput => {
  const { organization, apiEnvironment } = params

  const maybeStagingPrefix = core.IS_PROD ? '' : 'stg_'
  const unparsedMeta: ApiKey.SecretMetadata = {
    userId: params.userId,
    type: FlowgladApiKeyType.Secret,
  }
  const secretMeta = secretApiKeyMetadataSchema.parse(unparsedMeta)

  return {
    apiId: core.envVariable('UNKEY_API_ID'),
    name: `${organization.id} / ${apiEnvironment} / ${params.name}`,
    environment: apiEnvironment,
    expires: params.expiresAt?.getTime(),
    externalId: organization.id,
    prefix: [maybeStagingPrefix, 'sk_', apiEnvironment].join(''),
    meta: secretMeta,
  }
}

export const createSecretApiKey = async (
  params: StandardCreateApiKeyParams
): Promise<CreateApiKeyResult> => {
  if (params.type !== FlowgladApiKeyType.Secret) {
    throw new Error(
      'createSecretApiKey: Only secret keys are supported at this time. Received type: ' +
        params.type
    )
  }

  const unkeyInput = secretApiKeyInputToUnkeyInput(params)
  const { result, error } = await unkey().keys.create(unkeyInput)

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
  return {
    apiKeyInsert: {
      organizationId: params.organization.id,
      name: params.name,
      token,
      livemode,
      active: true,
      unkeyId: result.keyId,
      type: FlowgladApiKeyType.Secret,
      expiresAt: params.expiresAt,
    },
    shownOnlyOnceKey: result.key,
  }
}

export const billingPortalApiKeyInputToUnkeyInput = (
  params: BillingPortalCreateApiKeyParams
): UnkeyInput => {
  const {
    organization,
    apiEnvironment,
    stackAuthHostedBillingUserId,
  } = params

  const maybeStagingPrefix = core.IS_PROD ? '' : 'stg_'

  const unparsedMeta: ApiKey.BillingPortalMetadata = {
    organizationId: params.organization.id,
    stackAuthHostedBillingUserId: params.stackAuthHostedBillingUserId,
    type: FlowgladApiKeyType.BillingPortalToken,
  }
  const billingPortalMeta =
    billingPortalApiKeyMetadataSchema.parse(unparsedMeta)
  return {
    apiId: core.envVariable('UNKEY_API_ID'),
    name: `${organization.id} / ${apiEnvironment} / ${params.name}`,
    environment: apiEnvironment,
    expires: params.expiresAt.getTime(),
    externalId: organization.id,
    prefix: [maybeStagingPrefix, 'bk_', apiEnvironment].join(''),
    meta: billingPortalMeta,
  }
}

export const createBillingPortalApiKey = async (
  params: BillingPortalCreateApiKeyParams
): Promise<CreateApiKeyResult> => {
  if (params.type !== FlowgladApiKeyType.BillingPortalToken) {
    throw new Error(
      'createBillingPortalApiKey: Only billing portal tokens are supported at this time. Received type: ' +
        params.type
    )
  }

  if (!params.stackAuthHostedBillingUserId) {
    throw new Error(
      'stackAuthHostedBillingUserId is required for billing portal tokens'
    )
  }

  if (!params.expiresAt) {
    throw new Error('expiresAt is required for billing portal tokens')
  }

  const unkeyInput = billingPortalApiKeyInputToUnkeyInput(params)
  const { result, error } = await unkey().keys.create(unkeyInput)

  if (error) {
    throw error
  }

  const livemode = params.apiEnvironment === 'live'
  /**
   * Hide the key in live mode
   */
  const token = livemode
    ? `bk_live_...${result.key.slice(-4)}`
    : result.key

  return {
    apiKeyInsert: {
      organizationId: params.organization.id,
      name: params.name,
      token,
      livemode,
      active: true,
      unkeyId: result.keyId,
      stackAuthHostedBillingUserId:
        params.stackAuthHostedBillingUserId,
      expiresAt: params.expiresAt,
      type: FlowgladApiKeyType.BillingPortalToken,
    },
    shownOnlyOnceKey: result.key,
  }
}

interface ReplaceApiKeyParams {
  organization: Organization.Record
  oldApiKey: ApiKey.Record
  userId: string
}

export const replaceBillingPortalApiKey = async (
  params: ReplaceApiKeyParams
): Promise<{
  apiKeyInsert: ApiKey.Insert
  shownOnlyOnceKey: string
}> => {
  if (
    params.oldApiKey.type !== FlowgladApiKeyType.BillingPortalToken
  ) {
    throw new Error('Can only replace billing portal API keys')
  }

  return await createBillingPortalApiKey({
    name: params.oldApiKey.name,
    apiEnvironment: params.oldApiKey.livemode ? 'live' : 'test',
    organization: params.organization,
    userId: params.userId,
    type: FlowgladApiKeyType.BillingPortalToken,
    stackAuthHostedBillingUserId:
      params.oldApiKey.stackAuthHostedBillingUserId,
    expiresAt: params.oldApiKey.expiresAt,
  })
}

export const replaceSecretApiKey = async (
  params: ReplaceApiKeyParams
): Promise<{
  apiKeyInsert: ApiKey.Insert
  shownOnlyOnceKey: string
}> => {
  if (params.oldApiKey.type !== FlowgladApiKeyType.Secret) {
    throw new Error('Can only replace secret API keys')
  }

  return await createSecretApiKey({
    name: params.oldApiKey.name,
    apiEnvironment: params.oldApiKey.livemode ? 'live' : 'test',
    organization: params.organization,
    userId: params.userId,
    type: FlowgladApiKeyType.Secret,
    expiresAt: params.oldApiKey.expiresAt ?? undefined,
  })
}

export const deleteApiKey = async (keyId: string) => {
  await unkey().keys.delete({
    keyId,
  })
}

export const parseUnkeyMeta =
  (rawUnkeyMeta?: {}): ApiKey.ApiKeyMetadata => {
    if (!rawUnkeyMeta) {
      throw new Error('No unkey metadata provided')
    }
    const firstUnkeyMetaResult =
      apiKeyMetadataSchema.safeParse(rawUnkeyMeta)
    if (firstUnkeyMetaResult.success) {
      return firstUnkeyMetaResult.data
    } else if (
      !firstUnkeyMetaResult.success &&
      firstUnkeyMetaResult.error.issues.some(
        (issue) =>
          issue.code === 'invalid_union' &&
          issue.path[0] === 'type' &&
          issue.path.length === 1
      )
    ) {
      // @ts-expect-error object is not typed
      const metaType = rawUnkeyMeta.type
      if (metaType && metaType !== FlowgladApiKeyType.Secret) {
        throw new Error(
          `Invalid unkey metadata. Received metadata with type ${metaType} but expected type ${FlowgladApiKeyType.Secret}`
        )
      }
      const secondUnkeyMetaResult = apiKeyMetadataSchema.safeParse({
        ...rawUnkeyMeta,
        type: FlowgladApiKeyType.Secret,
      })
      if (!secondUnkeyMetaResult.success) {
        throw new Error(
          `Invalid unkey metadata: ${JSON.stringify(
            secondUnkeyMetaResult.error.issues
          )}`
        )
      }
      return secondUnkeyMetaResult.data
    }
    throw new Error('Invalid unkey metadata')
  }
