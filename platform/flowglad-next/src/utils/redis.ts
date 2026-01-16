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

/**
 * No-op stub client used in unit tests by default.
 *
 * IMPORTANT: This stub does NOT store or retrieve any data. All operations
 * are no-ops that return empty/null values. This means:
 *
 * - Caching behavior is NOT tested in unit tests using this stub
 * - Cache invalidation has no observable effect
 * - Any code that relies on cached data will always get cache misses
 *
 * If you need to test actual caching behavior, use one of these approaches:
 *
 * 1. Integration tests: Set REDIS_INTEGRATION_TEST_MODE=true to use real Redis
 *    (see cache.integration.test.ts for examples)
 *
 * 2. Stateful mock: Use _setTestRedisClient() to inject a mock that stores data
 *    (useful if you need to test cache hits/misses in unit tests)
 */
const testStubClient = {
  get: () => null,
  getdel: () => null,
  set: () => null,
  del: () => null,
  sadd: () => 0,
  smembers: () => [] as string[],
  expire: () => null,
  exists: () => 0,
}

/**
 * Allows tests to inject a custom Redis client.
 * Use this to provide a stateful mock if you need to test cache behavior
 * in unit tests without hitting real Redis.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _testRedisClient: any = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const _setTestRedisClient = (client: any) => {
  _testRedisClient = client
}

/**
 * Returns a Redis client.
 *
 * In unit tests (NODE_ENV=test), returns either:
 * - A custom client set via _setTestRedisClient(), or
 * - The default testStubClient (no-op stub)
 *
 * In integration tests (REDIS_INTEGRATION_TEST_MODE=true), returns real Redis.
 * In production, returns real Redis.
 */
export const redis = () => {
  if (
    core.IS_TEST &&
    process.env.REDIS_INTEGRATION_TEST_MODE !== 'true'
  ) {
    return _testRedisClient ?? testStubClient
  }
  return new Redis({
    url: core.envVariable('UPSTASH_REDIS_REST_URL'),
    token: core.envVariable('UPSTASH_REDIS_REST_TOKEN'),
  })
}

export enum RedisKeyNamespace {
  ApiKeyVerificationResult = 'apiKeyVerificationResult',
  ReferralSelection = 'referralSelection',
  Telemetry = 'telemetry',
  BannerDismissals = 'bannerDismissals',
  StripeOAuthCsrfToken = 'stripeOAuthCsrfToken',
  SubscriptionsByCustomer = 'subscriptionsByCustomer',
  ItemsBySubscription = 'itemsBySubscription',
  FeaturesBySubscriptionItem = 'featuresBySubscriptionItem',
  MeterBalancesBySubscription = 'meterBalancesBySubscription',
  CacheDependencyRegistry = 'cacheDeps',
  CacheRecomputeMetadata = 'cacheRecompute',
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
    ttl: 60 * 60 * 24 * 30, // 30 days - allows time for later processing
  },
  [RedisKeyNamespace.Telemetry]: {
    max: 500000, // up to 500k telemetry records
    ttl: 60 * 60 * 24 * 14, // 14 days (matches trigger.dev TTL)
  },
  [RedisKeyNamespace.BannerDismissals]: {
    max: 100000, // up to 100k users
    // No TTL - dismissals are permanent until manually reset
  },
  [RedisKeyNamespace.StripeOAuthCsrfToken]: {
    max: 10000, // up to 10k concurrent OAuth flows
    ttl: 60 * 15, // 15 minutes - OAuth flow timeout
  },
  [RedisKeyNamespace.SubscriptionsByCustomer]: {
    max: 50000,
  },
  [RedisKeyNamespace.ItemsBySubscription]: {
    max: 100000,
  },
  [RedisKeyNamespace.FeaturesBySubscriptionItem]: {
    max: 200000,
  },
  [RedisKeyNamespace.MeterBalancesBySubscription]: {
    max: 100000,
  },
  [RedisKeyNamespace.CacheDependencyRegistry]: {
    max: 500000, // Higher limit - these are small Sets mapping deps to cache keys
  },
  [RedisKeyNamespace.CacheRecomputeMetadata]: {
    max: 500000, // One metadata entry per recomputable cache key
    ttl: 86400, // 24 hours - same as dependency registry
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

// Banner dismissal functions for sidebar banner carousel

/**
 * Store a dismissed banner ID for a user.
 * Uses Redis Set to allow per-banner dismissal tracking.
 * Dismissals are permanent until manually reset via resetDismissedBanners.
 */
export const dismissBanner = async (
  userId: string,
  bannerId: string
): Promise<void> => {
  try {
    const redisClient = redis()
    const key = `${RedisKeyNamespace.BannerDismissals}:${userId}`
    await redisClient.sadd(key, bannerId)
  } catch (error) {
    logger.error('Error dismissing banner', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      bannerId,
    })
    throw error
  }
}

/**
 * Store multiple dismissed banner IDs for a user in a single operation.
 * More efficient than calling dismissBanner multiple times.
 * Dismissals are permanent until manually reset via resetDismissedBanners.
 */
export const dismissBanners = async (
  userId: string,
  bannerIds: string[]
): Promise<void> => {
  if (bannerIds.length === 0) return

  try {
    const redisClient = redis()
    const key = `${RedisKeyNamespace.BannerDismissals}:${userId}`

    // Redis SADD accepts multiple members - cast to satisfy Upstash's tuple types
    await redisClient.sadd(
      key,
      ...(bannerIds as [string, ...string[]])
    )
  } catch (error) {
    logger.error('Error dismissing banners', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      bannerIds,
    })
    throw error
  }
}

/**
 * Get all dismissed banner IDs for a user.
 * Throws on error to allow proper error handling by callers.
 */
export const getDismissedBannerIds = async (
  userId: string
): Promise<string[]> => {
  try {
    const redisClient = redis()
    const key = `${RedisKeyNamespace.BannerDismissals}:${userId}`
    const result = await redisClient.smembers(key)
    return result ?? []
  } catch (error) {
    logger.error('Error getting dismissed banner IDs', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
    throw error
  }
}

/**
 * Reset all dismissed banners for a user.
 * Useful for testing or if user wants to see banners again.
 */
export const resetDismissedBanners = async (
  userId: string
): Promise<void> => {
  try {
    const redisClient = redis()
    const key = `${RedisKeyNamespace.BannerDismissals}:${userId}`
    await redisClient.del(key)
  } catch (error) {
    logger.error('Error resetting dismissed banners', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    })
    throw error
  }
}

/**
 * Lua script for atomic LRU cache eviction.
 *
 * This script:
 * 1. Adds the cache key to a namespace's sorted set (score = timestamp)
 * 2. Checks if the set size exceeds the max
 * 3. If so, evicts the oldest entries (lowest scores)
 *
 * KEYS[1] = ZSET key (namespace:lru)
 * KEYS[2] = cache key to add
 * ARGV[1] = current timestamp
 * ARGV[2] = max size
 *
 * Returns: number of entries evicted
 */
const LRU_EVICTION_SCRIPT = `
local zsetKey = KEYS[1]
local cacheKey = KEYS[2]
local timestamp = tonumber(ARGV[1])
local maxSize = tonumber(ARGV[2])

-- Add the cache key with current timestamp as score
redis.call('ZADD', zsetKey, timestamp, cacheKey)

-- Check current size
local size = redis.call('ZCARD', zsetKey)

if size > maxSize then
  -- Calculate how many to evict
  local toEvictCount = size - maxSize
  -- Get the oldest entries (lowest scores)
  local toEvict = redis.call('ZRANGE', zsetKey, 0, toEvictCount - 1)
  if #toEvict > 0 then
    -- Delete the cache entries
    redis.call('DEL', unpack(toEvict))
    -- Remove from the ZSET
    redis.call('ZREM', zsetKey, unpack(toEvict))
  end
  return #toEvict
end

return 0
`

/**
 * Get the max size for a namespace from the eviction policy.
 */
export function getMaxSizeForNamespace(
  namespace: RedisKeyNamespace
): number {
  return evictionPolicy[namespace]?.max ?? 10000
}

/**
 * Track a cache key in the namespace's LRU set and evict oldest entries if over limit.
 *
 * This function atomically:
 * 1. Adds the cache key to a sorted set (score = current timestamp)
 * 2. Checks if the set exceeds max size
 * 3. Evicts oldest entries (by score) if needed
 *
 * Uses a Lua script for atomicity - no race conditions between size check and eviction.
 *
 * @param namespace - The cache namespace
 * @param cacheKey - The full cache key being written
 * @returns Number of entries evicted (0 if none)
 */
export async function trackAndEvictLRU(
  namespace: RedisKeyNamespace,
  cacheKey: string
): Promise<number> {
  try {
    const redisClient = redis()
    const zsetKey = `${namespace}:lru`
    const maxSize = getMaxSizeForNamespace(namespace)
    const timestamp = Date.now()

    // Execute the Lua script atomically
    const evicted = await redisClient.eval(
      LRU_EVICTION_SCRIPT,
      [zsetKey, cacheKey],
      [timestamp, maxSize]
    )

    const evictedCount =
      typeof evicted === 'number' ? evicted : Number(evicted) || 0

    if (evictedCount > 0) {
      logger.debug('LRU eviction performed', {
        namespace,
        evictedCount,
        maxSize,
      })
    }

    return evictedCount
  } catch (error) {
    // Fail open - log but don't throw
    // Cache write should still succeed even if LRU tracking fails
    logger.warn('LRU tracking failed', {
      namespace,
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

/**
 * Remove a cache key from the LRU tracking set.
 * Called when a cache entry is explicitly invalidated.
 */
export async function removeFromLRU(
  namespace: RedisKeyNamespace,
  cacheKey: string
): Promise<void> {
  try {
    const redisClient = redis()
    const zsetKey = `${namespace}:lru`
    await redisClient.zrem(zsetKey, cacheKey)
  } catch (error) {
    // Fail open - log but don't throw
    logger.warn('Failed to remove from LRU', {
      namespace,
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
