import { FlowgladApiKeyType } from '@db-core/enums'
import {
  type ApiKey,
  apiKeyMetadataSchema,
  secretApiKeyMetadataSchema,
} from '@db-core/schema/apiKeys'
import type { Organization } from '@db-core/schema/organizations'
import { Unkey } from '@unkey/api'
import type { V2KeysVerifyKeyResponseData } from '@unkey/api/models/components'
import { type ApiEnvironment } from '@/types'
import { hashData } from './backendCore'
import core from './core'
import { logger } from './logger'
import {
  getApiKeyVerificationResult,
  setApiKeyVerificationResult,
} from './redis'
import { type Checkpoint, tracedWithCheckpoints } from './tracing'

export type VerifyApiKeyResultData = V2KeysVerifyKeyResponseData & {
  ownerId?: string
  environment?: string
  requestId?: string
}

export type VerifyApiKeyResult = {
  result: VerifyApiKeyResultData | undefined
  error: unknown | undefined
}

/**
 * Create an Unkey client configured from the `UNKEY_ROOT_KEY` environment variable.
 *
 * When `UNKEY_MOCK_HOST` is set, the client uses that URL as the server endpoint.
 * This enables testing against a mock server (e.g., flowglad-mock-server) instead
 * of the production Unkey API.
 *
 * @returns An Unkey client instance.
 */
export const unkey = () =>
  new Unkey({
    rootKey: core.IS_TEST
      ? 'test_root_key'
      : core.envVariable('UNKEY_ROOT_KEY'),
    serverURL: process.env.UNKEY_MOCK_HOST || undefined,
  })

/**
 * Core verifyApiKey logic with checkpoint callbacks for tracing.
 * Business logic is separated from span management.
 */
const verifyApiKeyCore = async (
  checkpoint: Checkpoint,
  apiKey: string
): Promise<VerifyApiKeyResult> => {
  const keyPrefix = apiKey.substring(0, 8)
  checkpoint({
    'auth.key_prefix': keyPrefix,
  })

  // Check cache first
  const cacheStartTime = Date.now()
  const cachedVerificationResult =
    await getApiKeyVerificationResult(apiKey)
  const cacheLookupDuration = Date.now() - cacheStartTime

  if (cachedVerificationResult) {
    checkpoint({
      'auth.cache_hit': true,
      'auth.verification_source': 'cache',
      'auth.cache_lookup_duration_ms': cacheLookupDuration,
    })

    logger.info('API Key verification cache hit', {
      key_prefix: keyPrefix,
      cache_lookup_duration_ms: cacheLookupDuration,
      cached_valid: cachedVerificationResult.result?.valid,
    })

    return cachedVerificationResult
  }

  // Cache miss - call Unkey API
  checkpoint({
    'auth.cache_hit': false,
    'auth.verification_source': 'unkey_api',
    'auth.cache_lookup_duration_ms': cacheLookupDuration,
  })

  logger.info('API Key verification cache miss, calling Unkey', {
    key_prefix: keyPrefix,
    cache_lookup_duration_ms: cacheLookupDuration,
  })

  const unkeyStartTime = Date.now()
  const unkeyApiId = core.envVariable('UNKEY_API_ID')

  // Log what we're sending to Unkey
  logger.info('Calling Unkey API for verification', {
    key_prefix: keyPrefix,
    unkey_api_id: unkeyApiId,
    has_root_key: !!core.envVariable('UNKEY_ROOT_KEY'),
  })

  const verificationResponse = await unkey().keys.verifyKey({
    key: apiKey,
  })
  const unkeyDuration = Date.now() - unkeyStartTime

  // Convert to the expected format with result/error structure
  const resultData: VerifyApiKeyResultData = {
    ...verificationResponse.data,
    ownerId: verificationResponse.data.identity?.externalId,
    // Extract environment from key prefix if not in meta
    environment:
      (verificationResponse.data.meta?.environment as
        | string
        | undefined) || (apiKey.includes('_live_') ? 'live' : 'test'),
    requestId: verificationResponse.meta.requestId,
  }
  const verificationResult: VerifyApiKeyResult = {
    result: resultData,
    error: undefined,
  }

  // Log the full response for debugging
  if (!verificationResult.result?.valid) {
    logger.warn('Unkey verification failed', {
      key_prefix: keyPrefix,
      unkey_api_id: unkeyApiId,
      response_valid: verificationResult.result?.valid || false,
      response_code: verificationResult.result?.code || 'UNKNOWN',
      error: verificationResult.error,
      full_result: JSON.stringify(verificationResult.result),
      unkey_duration_ms: unkeyDuration,
    })
  }

  checkpoint({
    'auth.unkey_api_duration_ms': unkeyDuration,
    'auth.unkey_response_valid':
      verificationResult.result?.valid || false,
    'auth.unkey_response_code':
      verificationResult.result?.code || 'UNKNOWN',
  })

  // Cache the result
  const cacheWriteStartTime = Date.now()
  await setApiKeyVerificationResult(apiKey, verificationResult)
  const cacheWriteDuration = Date.now() - cacheWriteStartTime

  checkpoint({
    'auth.cache_write_duration_ms': cacheWriteDuration,
  })

  logger.info('API Key verification completed', {
    key_prefix: keyPrefix,
    unkey_duration_ms: unkeyDuration,
    cache_write_duration_ms: cacheWriteDuration,
    valid: verificationResult.result?.valid,
    code: verificationResult.result?.code,
  })

  return verificationResult
}

export const verifyApiKey = tracedWithCheckpoints(
  {
    options: {
      spanName: 'verifyApiKey',
      tracerName: 'api-key-verification' as const,
    },
  },
  verifyApiKeyCore
)

export interface StandardCreateApiKeyParams {
  name: string
  apiEnvironment: ApiEnvironment
  organization: Pick<Organization.Record, 'id'>
  userId: string
  type: FlowgladApiKeyType.Secret
  expiresAt?: Date | number
  pricingModelId: string
}

interface CreateApiKeyResult {
  apiKeyInsert: ApiKey.Insert
  shownOnlyOnceKey: string
}

type UnkeyInput = Parameters<
  ReturnType<typeof unkey>['keys']['createKey']
>[0]

export const secretApiKeyInputToUnkeyInput = (
  params: StandardCreateApiKeyParams
): UnkeyInput => {
  const { organization, apiEnvironment, pricingModelId } = params

  const maybeStagingPrefix = core.IS_PROD ? '' : 'stg_'
  // Extract first 4 chars from pricingModelId (after 'pricing_model_' prefix)
  const pmIdSuffix = pricingModelId
    .replace('pricing_model_', '')
    .slice(0, 4)

  const unparsedMeta: ApiKey.SecretMetadata = {
    userId: params.userId,
    type: FlowgladApiKeyType.Secret,
    pricingModelId,
  }
  const secretMeta = secretApiKeyMetadataSchema.parse(unparsedMeta)

  return {
    apiId: core.envVariable('UNKEY_API_ID'),
    name: `${organization.id} / ${apiEnvironment} / ${pricingModelId} / ${params.name}`,
    expires: params.expiresAt
      ? new Date(params.expiresAt).getTime()
      : undefined,
    externalId: organization.id,
    prefix: [
      maybeStagingPrefix,
      'sk_',
      apiEnvironment,
      '_',
      pmIdSuffix,
    ].join(''),
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
  const createResponse = await unkey().keys.createKey(unkeyInput)

  const result = createResponse.data

  const livemode = params.apiEnvironment === 'live'
  /**
   * Hide the key in live mode - preserve full prefix including PM ID suffix
   */
  const token = livemode
    ? `${unkeyInput.prefix}_...${result.key.slice(-4)}`
    : result.key
  return {
    apiKeyInsert: {
      organizationId: params.organization.id,
      pricingModelId: params.pricingModelId,
      name: params.name,
      token,
      livemode,
      active: true,
      unkeyId: result.keyId,
      type: FlowgladApiKeyType.Secret,
      expiresAt: params.expiresAt
        ? new Date(params.expiresAt).getTime()
        : undefined,
      hashText: hashData(result.key),
    },
    shownOnlyOnceKey: result.key,
  }
}

interface ReplaceApiKeyParams {
  organization: Organization.Record
  oldApiKey: ApiKey.Record
  userId: string
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
    pricingModelId: params.oldApiKey.pricingModelId,
  })
}

export const deleteApiKey = async (keyId: string) => {
  await unkey().keys.deleteKey({
    keyId,
  })
}

export const parseUnkeyMeta =
  (rawUnkeyMeta?: {}): ApiKey.ApiKeyMetadata => {
    if (!rawUnkeyMeta) {
      throw new Error('No unkey metadata provided')
    }

    // First, try to parse with the schema directly
    const firstUnkeyMetaResult =
      apiKeyMetadataSchema.safeParse(rawUnkeyMeta)
    if (firstUnkeyMetaResult.success) {
      return firstUnkeyMetaResult.data
    }

    const metaType = (rawUnkeyMeta as { type?: string }).type

    // If there's an explicit type that's not Secret, reject it
    if (metaType && metaType !== FlowgladApiKeyType.Secret) {
      throw new Error(
        `Invalid unkey metadata. Received metadata with type ${metaType} but expected type ${FlowgladApiKeyType.Secret}`
      )
    }

    // Try adding the Secret type for legacy keys that don't have a type field
    const secondUnkeyMetaResult = apiKeyMetadataSchema.safeParse({
      ...rawUnkeyMeta,
      type: FlowgladApiKeyType.Secret,
    })
    if (secondUnkeyMetaResult.success) {
      return secondUnkeyMetaResult.data
    }

    throw new Error('Invalid unkey metadata')
  }
