import { Redis } from '@upstash/redis'
import { z } from 'zod'
import type { TelemetryEntityType, TelemetryRecord } from '@/types'
import { referralOptionEnum } from '@/utils/referrals'
import type { verifyApiKey } from '@/utils/unkey'
import { hashData } from './backendCore'
import core from './core'
import { logger } from './logger'

export const referralSelectionSchema = z.object({
  // The organization/user selecting the referral option; can be used to partition keys
  subjectId: z.string().min(1),
  // One of the predefined referral options
  source: referralOptionEnum,
  // ISO string timestamp for when the selection occurred
  selectedAt: z.string().datetime().optional(),
})

const verificationCodeEnum = z.enum([
  'VALID',
  'NOT_FOUND',
  'FORBIDDEN',
  'USAGE_EXCEEDED',
  'RATE_LIMITED',
  'DISABLED',
  'INSUFFICIENT_PERMISSIONS',
  'EXPIRED',
  'INSUFFICIENT_CREDITS',
])

const errorResponseSchema = z.object({
  result: z.undefined(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    docs: z.string(),
    requestId: z.string(),
  }),
})

const successResponseSchema = z.object({
  result: z.object({
    keyId: z.string().optional(),
    valid: z.boolean(),
    name: z.string().optional(),
    ownerId: z.string().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    expires: z.number().optional(),
    ratelimit: z
      .object({
        limit: z.number(),
        remaining: z.number(),
        reset: z.number(),
      })
      .optional(),
    remaining: z.number().optional(),
    code: verificationCodeEnum,
    enabled: z.boolean().optional(),
    permissions: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    environment: z.string().optional(),
    identity: z
      .object({
        id: z.string(),
        externalId: z.string(),
        meta: z.record(z.string(), z.unknown()),
      })
      .optional(),
    requestId: z.string().optional(),
  }),
  error: z.undefined(),
})

export const apiKeyVerificationResultSchema = z.union([
  errorResponseSchema,
  successResponseSchema,
])

type ApiKeyVerificationResult = z.infer<
  typeof apiKeyVerificationResultSchema
>

const redis = () => {
  if (core.IS_TEST) {
    return {
      get: () => null,
      set: () => null,
      del: () => null,
    }
  }
  return new Redis({
    url: core.envVariable('UPSTASH_REDIS_REST_URL'),
    token: core.envVariable('UPSTASH_REDIS_REST_TOKEN'),
  })
}

enum RedisKeyNamespace {
  ApiKeyVerificationResult = 'apiKeyVerificationResult',
  ReferralSelection = 'referralSelection',
  Telemetry = 'telemetry',
}

const evictionPolicy: Record<
  RedisKeyNamespace,
  Record<string, number>
> = {
  [RedisKeyNamespace.ApiKeyVerificationResult]: {
    max: 100000, // 100,000 items
    ttl: 60 * 60 * 2.4, // 2.4 hours
  },
  [RedisKeyNamespace.ReferralSelection]: {
    max: 200000, // up to 200k selections across tenants
  },
  [RedisKeyNamespace.Telemetry]: {
    max: 500000, // up to 500k telemetry records
    ttl: 60 * 60 * 24 * 14, // 14 days (matches trigger.dev TTL)
  },
}

export const setApiKeyVerificationResult = async (
  apiKey: string,
  result: Awaited<ReturnType<typeof verifyApiKey>>
) => {
  try {
    const redisClient = redis()
    const apiKeyHash = hashData(apiKey)
    await redisClient.set(
      `apiKeyVerificationResult:${apiKeyHash}`,
      JSON.stringify(result),
      {
        ex: evictionPolicy[RedisKeyNamespace.ApiKeyVerificationResult]
          .ttl,
      }
    )
  } catch (error) {
    console.error('Error setting api key verification result', error)
  }
}

/**
 * Store a user's/organization's referral selection in Redis.
 * Uses a namespaced key: `referralSelection:{subjectId}`
 * Intentionally no getter/deleter; this serves as a cache/store for later processing.
 */
export const setReferralSelection = async (
  params: z.infer<typeof referralSelectionSchema>
) => {
  try {
    const redisClient = redis()
    const payload = referralSelectionSchema.parse({
      ...params,
      selectedAt: params.selectedAt ?? new Date().toISOString(),
    })
    const key = `${RedisKeyNamespace.ReferralSelection}:${payload.subjectId}`
    await redisClient.set(key, JSON.stringify(payload), {
      ex: evictionPolicy[RedisKeyNamespace.ReferralSelection].ttl,
    })
  } catch (error) {
    console.error('Error setting referral selection', error)
  }
}

export const deleteApiKeyVerificationResult = async ({
  hashText,
}: {
  hashText: string
}) => {
  const redisClient = redis()
  await redisClient.del(
    `${RedisKeyNamespace.ApiKeyVerificationResult}:${hashText}`
  )
}

export const getApiKeyVerificationResult = async (
  apiKey: string
): Promise<ApiKeyVerificationResult | null> => {
  try {
    const redisClient = redis()
    const apiKeyHash = hashData(apiKey)
    const result = await redisClient.get(
      `${RedisKeyNamespace.ApiKeyVerificationResult}:${apiKeyHash}`
    )
    const jsonResult =
      typeof result === 'string' ? JSON.parse(result) : result
    if (!jsonResult) {
      return null
    }
    const parsed =
      apiKeyVerificationResultSchema.safeParse(jsonResult)
    if (!parsed.success) {
      console.error(
        'Error parsing api key verification result',
        parsed.error
      )
      return null
    }
    return parsed.data
  } catch (error) {
    console.error('Error getting api key verification result', error)
    return null
  }
}

// Telemetry functions for trigger.dev debugging
/**
 * Store telemetry data when a trigger.dev task processes a business entity
 */
export const storeTelemetry = async (
  entityType: TelemetryEntityType,
  entityId: string,
  runId: string
): Promise<void> => {
  try {
    const key = `${RedisKeyNamespace.Telemetry}:${entityType}:${entityId}`

    const record: TelemetryRecord = {
      runId,
    }

    await redis().set(key, JSON.stringify(record), {
      ex: evictionPolicy[RedisKeyNamespace.Telemetry].ttl,
    })
  } catch (error) {
    // Log but don't throw - telemetry is a side effect
    logger.warn('Telemetry storage failed', {
      error: error instanceof Error ? error.message : String(error),
      entityType,
      entityId,
      runId,
    })
  }
}
