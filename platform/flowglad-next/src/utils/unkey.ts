import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { Unkey, verifyKey } from '@unkey/api'
import {
  type ApiKey,
  apiKeyMetadataSchema,
  billingPortalApiKeyMetadataSchema,
  secretApiKeyMetadataSchema,
} from '@/db/schema/apiKeys'
import type { Organization } from '@/db/schema/organizations'
import { type ApiEnvironment, FlowgladApiKeyType } from '@/types'
import { hashData } from './backendCore'
import core from './core'
import { logger } from './logger'
import {
  getApiKeyVerificationResult,
  setApiKeyVerificationResult,
} from './redis'

export const unkey = () =>
  new Unkey({
    rootKey: core.IS_TEST
      ? 'test_root_key'
      : core.envVariable('UNKEY_ROOT_KEY'),
  })

export const verifyApiKey = async (apiKey: string) => {
  const tracer = trace.getTracer('api-key-verification')

  return tracer.startActiveSpan(
    'verifyApiKey',
    { kind: SpanKind.INTERNAL },
    async (span) => {
      try {
        const keyPrefix = apiKey.substring(0, 8)
        span.setAttributes({
          'auth.key_prefix': keyPrefix,
        })

        // Check cache first
        const cacheStartTime = Date.now()
        const cachedVerificationResult =
          await getApiKeyVerificationResult(apiKey)
        const cacheLookupDuration = Date.now() - cacheStartTime

        if (cachedVerificationResult) {
          span.setAttributes({
            'auth.cache_hit': true,
            'auth.verification_source': 'cache',
            'auth.cache_lookup_duration_ms': cacheLookupDuration,
          })
          span.setStatus({ code: SpanStatusCode.OK })

          logger.info('API Key verification cache hit', {
            key_prefix: keyPrefix,
            cache_lookup_duration_ms: cacheLookupDuration,
            cached_valid: cachedVerificationResult.result?.valid,
          })

          return cachedVerificationResult
        }

        // Cache miss - call Unkey API
        span.setAttributes({
          'auth.cache_hit': false,
          'auth.verification_source': 'unkey_api',
          'auth.cache_lookup_duration_ms': cacheLookupDuration,
        })

        logger.info(
          'API Key verification cache miss, calling Unkey',
          {
            key_prefix: keyPrefix,
            cache_lookup_duration_ms: cacheLookupDuration,
          }
        )

        const unkeyStartTime = Date.now()
        const unkeyApiId = core.envVariable('UNKEY_API_ID')

        // Log what we're sending to Unkey
        logger.info('Calling Unkey API for verification', {
          key_prefix: keyPrefix,
          unkey_api_id: unkeyApiId,
          has_root_key: !!core.envVariable('UNKEY_ROOT_KEY'),
        })

        const verificationResult = await verifyKey({
          key: apiKey,
          apiId: unkeyApiId,
        })
        const unkeyDuration = Date.now() - unkeyStartTime

        // Log the full response for debugging
        if (!verificationResult.result?.valid) {
          logger.warn('Unkey verification failed', {
            key_prefix: keyPrefix,
            unkey_api_id: unkeyApiId,
            response_valid: verificationResult.result?.valid || false,
            response_code:
              verificationResult.result?.code || 'UNKNOWN',
            error: verificationResult.error,
            full_result: JSON.stringify(verificationResult.result),
            unkey_duration_ms: unkeyDuration,
          })
        }

        span.setAttributes({
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

        span.setAttributes({
          'auth.cache_write_duration_ms': cacheWriteDuration,
        })

        span.setStatus({ code: SpanStatusCode.OK })

        logger.info('API Key verification completed', {
          key_prefix: keyPrefix,
          unkey_duration_ms: unkeyDuration,
          cache_write_duration_ms: cacheWriteDuration,
          valid: verificationResult.result?.valid,
          code: verificationResult.result?.code,
        })

        return verificationResult
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })

        logger.error('API Key verification error', {
          error: error as Error,
          key_prefix: apiKey.substring(0, 8),
        })

        throw error
      } finally {
        span.end()
      }
    }
  )
}

export interface StandardCreateApiKeyParams {
  name: string
  apiEnvironment: ApiEnvironment
  organization: Pick<Organization.Record, 'id'>
  userId: string
  type: FlowgladApiKeyType.Secret
  expiresAt?: Date | number
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
    expires: params.expiresAt
      ? new Date(params.expiresAt).getTime()
      : undefined,
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
