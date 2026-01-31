import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'
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
 * 1. Integration tests: Use .env.integration with real Redis credentials
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
  // Stream commands for Redis Streams support
  xadd: () => `${Date.now()}-0`, // Returns stream entry ID
  xread: () => [], // Returns empty array (no entries)
  xrange: () => [], // Returns empty array (no entries)
  xrevrange: () => [], // Returns empty array (no entries)
  xlen: () => 0, // Returns stream length
  xtrim: () => 0, // Returns number of entries trimmed
  xdel: () => 1, // Returns number of entries deleted
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
 * Priority:
 * 1. If _setTestRedisClient() was called, use that client (test override)
 * 2. In test environment (IS_TEST), use the no-op stub client
 * 3. In production, use real Redis
 *
 * For integration tests that need real Redis, use _setTestRedisClient() to
 * inject a real client explicitly.
 */
export const redis = () => {
  // Explicit test client injection takes priority
  if (_testRedisClient !== null) {
    return _testRedisClient
  }

  // In test environment, always use the no-op stub
  if (core.IS_TEST) {
    return testStubClient
  }

  // Production uses real Redis
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
  PaymentMethodsByCustomer = 'paymentMethodsByCustomer',
  PurchasesByCustomer = 'purchasesByCustomer',
  InvoicesByCustomer = 'invoicesByCustomer',
  UsageMetersByPricingModel = 'usageMetersByPricingModel',
  CacheDependencyRegistry = 'cacheDeps',
  // Pricing model cache atoms
  PricingModel = 'pricingModel',
  ProductsByPricingModel = 'productsByPricingModel',
  PricesByPricingModel = 'pricesByPricingModel',
  FeaturesByPricingModel = 'featuresByPricingModel',
  ProductFeaturesByPricingModel = 'productFeaturesByPricingModel',
  // Sync stream for SSE event streaming
  SyncStream = 'syncStream',
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
  [RedisKeyNamespace.PaymentMethodsByCustomer]: {
    max: 50000,
  },
  [RedisKeyNamespace.PurchasesByCustomer]: {
    max: 50000,
  },
  [RedisKeyNamespace.InvoicesByCustomer]: {
    max: 50000,
  },
  [RedisKeyNamespace.UsageMetersByPricingModel]: {
    max: 50000, // Usage meters are config data, typically 5-20 per pricing model
  },
  [RedisKeyNamespace.CacheDependencyRegistry]: {
    max: 500000, // Higher limit - these are small Sets mapping deps to cache keys
    ttl: 86400, // 24 hours
  },
  // Pricing model cache atoms - keyed by pricingModelId
  [RedisKeyNamespace.PricingModel]: {
    max: 50000,
  },
  [RedisKeyNamespace.ProductsByPricingModel]: {
    max: 50000,
  },
  [RedisKeyNamespace.PricesByPricingModel]: {
    max: 100000,
  },
  [RedisKeyNamespace.FeaturesByPricingModel]: {
    max: 100000,
  },
  [RedisKeyNamespace.ProductFeaturesByPricingModel]: {
    max: 100000,
  },
  // Sync streams use MAXLEN for eviction, not LRU
  [RedisKeyNamespace.SyncStream]: {
    maxlen: 100000, // Max 100k events per stream
    ttl: 60 * 60 * 24 * 7, // 7 days retention
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
 * Lua script for atomic LRU cache eviction with orphan cleanup.
 *
 * This script:
 * 1. Adds the cache key to a namespace's sorted set (score = timestamp)
 * 2. Checks if the set size exceeds the max
 * 3. If so, iterates through oldest entries and:
 *    - For orphans (expired TTL): removes from sorted set only
 *    - For real entries: deletes cache key and removes from sorted set
 *
 * This lazy cleanup ensures that TTL-expired entries don't accumulate in the
 * LRU sorted set, which would otherwise degrade eviction accuracy.
 *
 * KEYS[1] = ZSET key (namespace:lru)
 * KEYS[2] = cache key to add
 * ARGV[1] = current timestamp
 * ARGV[2] = max size
 *
 * Returns: JSON array [evictedCount, orphansRemoved]
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

local evictedCount = 0
local orphansRemoved = 0
local maxIterations = 100 -- Safety limit to prevent infinite loops

-- While over max size and haven't hit iteration limit
while size > maxSize and maxIterations > 0 do
  maxIterations = maxIterations - 1

  -- Get the oldest entry (lowest score)
  local oldest = redis.call('ZRANGE', zsetKey, 0, 0)
  if #oldest == 0 then
    break
  end

  local oldestKey = oldest[1]

  -- Check if the cache key still exists (not expired by TTL)
  local exists = redis.call('EXISTS', oldestKey)

  if exists == 1 then
    -- Real entry - delete cache key
    redis.call('DEL', oldestKey)
    evictedCount = evictedCount + 1
  else
    -- Orphan (TTL expired) - just clean up the sorted set entry
    orphansRemoved = orphansRemoved + 1
  end

  -- Remove from sorted set
  redis.call('ZREM', zsetKey, oldestKey)
  size = size - 1
end

return cjson.encode({evictedCount, orphansRemoved})
`

/**
 * Pre-computed SHA1 hash of the LRU eviction script.
 * Used with EVALSHA to avoid sending the full script on every call.
 */
const LRU_EVICTION_SCRIPT_SHA = createHash('sha1')
  .update(LRU_EVICTION_SCRIPT)
  .digest('hex')

/**
 * Execute a Lua script using EVALSHA with fallback to EVAL.
 *
 * Tries EVALSHA first (only sends script hash, not full script).
 * If Redis returns NOSCRIPT (script not cached), falls back to EVAL
 * which also caches the script for future EVALSHA calls.
 *
 * @param script - The full Lua script text
 * @param sha - Pre-computed SHA1 hash of the script
 * @param keys - KEYS array for the script
 * @param args - ARGV array for the script
 * @returns The script's return value
 */
async function evalWithShaFallback<T>(
  script: string,
  sha: string,
  keys: string[],
  args: (string | number)[]
): Promise<T> {
  const redisClient = redis()
  try {
    return (await redisClient.evalsha(sha, keys, args)) as T
  } catch (evalError) {
    const errorMessage =
      evalError instanceof Error
        ? evalError.message
        : String(evalError)
    if (errorMessage.includes('NOSCRIPT')) {
      return (await redisClient.eval(script, keys, args)) as T
    }
    throw evalError
  }
}

/**
 * Get the max size for a namespace from the eviction policy.
 */
export function getMaxSizeForNamespace(
  namespace: RedisKeyNamespace
): number {
  return evictionPolicy[namespace]?.max ?? 10000
}

/**
 * Get the SyncStream eviction policy configuration.
 */
export function getSyncStreamConfig(): {
  maxlen: number
  ttl: number
} {
  const policy = evictionPolicy[RedisKeyNamespace.SyncStream]
  return {
    maxlen: policy.maxlen ?? 100000,
    ttl: policy.ttl ?? 60 * 60 * 24 * 7,
  }
}

/**
 * Track a cache key in the namespace's LRU set and evict oldest entries if over limit.
 *
 * This function atomically:
 * 1. Adds the cache key to a sorted set (score = current timestamp)
 * 2. Checks if the set exceeds max size
 * 3. Evicts oldest entries (by score) if needed, cleaning up orphans along the way
 *
 * Orphan cleanup: When iterating through oldest entries, the script checks if each
 * cache key still exists. TTL-expired entries (orphans) are removed from the sorted
 * set without attempting to delete the already-gone cache key. This prevents the
 * LRU sorted set from accumulating stale entries over time.
 *
 * Uses EVALSHA to avoid sending the full script on every call. Falls back to
 * EVAL if the script isn't cached in Redis (which also caches it for future calls).
 *
 * @param namespace - The cache namespace
 * @param cacheKey - The full cache key being written
 * @returns Number of real entries evicted (0 if none)
 */
export async function trackAndEvictLRU(
  namespace: RedisKeyNamespace,
  cacheKey: string
): Promise<number> {
  try {
    const zsetKey = `${namespace}:lru`
    const maxSize = getMaxSizeForNamespace(namespace)
    const timestamp = Date.now()

    const result = await evalWithShaFallback<string>(
      LRU_EVICTION_SCRIPT,
      LRU_EVICTION_SCRIPT_SHA,
      [zsetKey, cacheKey],
      [timestamp, maxSize]
    )

    // Parse the JSON array result [evictedCount, orphansRemoved]
    let evictedCount = 0
    let orphansRemoved = 0
    try {
      const parsed = JSON.parse(result) as [number, number]
      evictedCount = parsed[0] ?? 0
      orphansRemoved = parsed[1] ?? 0
    } catch {
      // Fallback for unexpected format
      evictedCount = typeof result === 'number' ? result : 0
    }

    if (evictedCount > 0 || orphansRemoved > 0) {
      logger.debug('LRU eviction performed', {
        namespace,
        evictedCount,
        orphansRemoved,
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
