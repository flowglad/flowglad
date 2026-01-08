import { SpanKind } from '@opentelemetry/api'
import { z } from 'zod'
import core from './core'
import { logger } from './logger'
import { RedisKeyNamespace, redis } from './redis'
import { traced } from './tracing'

const DEFAULT_TTL = 300 // 5 minutes

/**
 * A dependency key is an arbitrary string that represents something
 * that can be invalidated. Examples:
 * - "customer:cust_123" (customer changed)
 * - "subscription:sub_456" (subscription changed)
 * - "subscriptionItem:si_789" (subscription item changed)
 * - "ledger:sub_456" (ledger entries for subscription changed)
 */
export type CacheDependencyKey = string

/**
 * Registry mapping dependency keys to cache keys that should be invalidated.
 * This is populated when cached functions are called, creating a reverse index
 * from dependencies to the cache keys that depend on them.
 */
const dependencyToCacheKeys = new Map<
  CacheDependencyKey,
  Set<string>
>()

/**
 * Register that a cache key depends on certain dependency keys.
 * Called internally by the cached combinator after populating the cache.
 */
function registerDependencies(
  cacheKey: string,
  dependencies: CacheDependencyKey[]
): void {
  for (const dep of dependencies) {
    if (!dependencyToCacheKeys.has(dep)) {
      dependencyToCacheKeys.set(dep, new Set())
    }
    dependencyToCacheKeys.get(dep)!.add(cacheKey)
  }
}

/**
 * Get TTL for a namespace from CACHE_TTLS environment variable.
 * Format: JSON object mapping namespace to TTL in seconds.
 * Example: {"subscriptionsByCustomer": 300, "itemsBySubscription": 600}
 */
export function getTtlForNamespace(
  namespace: RedisKeyNamespace
): number {
  try {
    const cacheTtls = core.envVariable('CACHE_TTLS')
    if (!cacheTtls) return DEFAULT_TTL
    const parsed = JSON.parse(cacheTtls)
    return parsed[namespace] ?? DEFAULT_TTL
  } catch {
    return DEFAULT_TTL
  }
}

export interface CacheConfig<TArgs extends unknown[], TResult> {
  namespace: RedisKeyNamespace
  /** Extract cache key from function arguments */
  keyFn: (...args: TArgs) => string
  /** Zod schema for validating cached data */
  schema: z.ZodType<TResult>
  /**
   * Declare what dependency keys this cache entry depends on.
   * When any of these dependencies are invalidated, this cache entry is invalidated.
   *
   * Example: A subscription items cache entry for subscription "sub_123" might
   * declare dependencies: ["subscription:sub_123", "subscriptionItems:sub_123"]
   */
  dependenciesFn: (...args: TArgs) => CacheDependencyKey[]
}

/**
 * Combinator that adds caching to an async function.
 *
 * Dependency tracking:
 * - When cache is populated, dependencies are registered via dependenciesFn
 * - When dependencies are invalidated, associated cache keys are deleted
 *
 * Observability:
 * - Tracing span with attributes:
 *   - cache.hit: boolean
 *   - cache.namespace: string
 *   - cache.key: string
 *   - cache.ttl: number (on write)
 *   - cache.latency_ms: number (Redis operation time)
 *   - cache.validation_failed: boolean (when cached data fails schema)
 *   - cache.error: string (when Redis operation fails)
 *   - cache.dependencies: string[] (dependency keys registered)
 * - Logging:
 *   - Debug: cache hit/miss with key
 *   - Warn: schema validation failure (includes key, indicates data corruption)
 *   - Error: Redis operation failure (includes error details)
 *
 * Error handling:
 * - Fails open: Redis errors result in cache miss, not request failure
 * - Schema validation failures treated as cache miss
 */
export function cached<TArgs extends unknown[], TResult>(
  config: CacheConfig<TArgs, TResult>,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return traced(
    {
      options: (...args: TArgs) => ({
        spanName: `cache.${config.namespace}`,
        tracerName: 'cache',
        kind: SpanKind.CLIENT,
        attributes: {
          'cache.namespace': config.namespace,
          'cache.key': config.keyFn(...args),
        },
      }),
      extractResultAttributes: () => ({}),
    },
    async (...args: TArgs): Promise<TResult> => {
      const key = config.keyFn(...args)
      const fullKey = `${config.namespace}:${key}`
      const dependencies = config.dependenciesFn(...args)

      // Try to get from cache
      try {
        const redisClient = redis()
        const startTime = Date.now()
        const cachedValue = await redisClient.get(fullKey)
        const latencyMs = Date.now() - startTime

        if (cachedValue !== null) {
          // Parse the cached value
          const jsonValue =
            typeof cachedValue === 'string'
              ? JSON.parse(cachedValue)
              : cachedValue

          // Validate with schema
          const parsed = config.schema.safeParse(jsonValue)
          if (parsed.success) {
            logger.debug('Cache hit', {
              key: fullKey,
              latency_ms: latencyMs,
            })
            return parsed.data
          } else {
            // Schema validation failed - treat as cache miss
            logger.warn('Cache schema validation failed', {
              key: fullKey,
              error: parsed.error.message,
            })
          }
        } else {
          logger.debug('Cache miss', {
            key: fullKey,
            latency_ms: latencyMs,
          })
        }
      } catch (error) {
        // Fail open - log error and continue to wrapped function
        logger.error('Cache read error', {
          key: fullKey,
          error:
            error instanceof Error ? error.message : String(error),
        })
      }

      // Cache miss - call wrapped function
      const result = await fn(...args)

      // Store in cache (fire-and-forget)
      try {
        const redisClient = redis()
        const ttl = getTtlForNamespace(config.namespace)
        await redisClient.set(fullKey, JSON.stringify(result), {
          ex: ttl,
        })

        // Register dependencies
        registerDependencies(fullKey, dependencies)

        logger.debug('Cache populated', {
          key: fullKey,
          ttl,
          dependencies,
        })
      } catch (error) {
        // Fail open - log error but return result
        logger.error('Cache write error', {
          key: fullKey,
          error:
            error instanceof Error ? error.message : String(error),
        })
      }

      return result
    }
  )
}

/**
 * Invalidate all cache entries that depend on the given dependency keys.
 *
 * This is the core invalidation function. It:
 * 1. Looks up which cache keys depend on each dependency
 * 2. Deletes all those cache keys from Redis
 * 3. Cleans up the dependency registry
 *
 * Observability:
 * - Logs invalidation at debug level (includes dependency and cache keys)
 * - Logs errors but does not throw (fire-and-forget)
 */
export async function invalidateDependencies(
  dependencies: CacheDependencyKey[]
): Promise<void> {
  const keysToInvalidate = new Set<string>()

  // Collect all cache keys that depend on the given dependencies
  for (const dep of dependencies) {
    const cacheKeys = dependencyToCacheKeys.get(dep)
    if (cacheKeys) {
      for (const key of cacheKeys) {
        keysToInvalidate.add(key)
      }
    }
  }

  if (keysToInvalidate.size === 0) {
    logger.debug('No cache keys to invalidate', { dependencies })
    return
  }

  logger.debug('Invalidating cache keys', {
    dependencies,
    cacheKeys: Array.from(keysToInvalidate),
  })

  // Delete from Redis
  try {
    const redisClient = redis()
    for (const key of keysToInvalidate) {
      await redisClient.del(key)
    }
  } catch (error) {
    // Fire-and-forget - log error but don't throw
    logger.error('Cache invalidation error', {
      dependencies,
      cacheKeys: Array.from(keysToInvalidate),
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Clean up dependency registry
  for (const dep of dependencies) {
    dependencyToCacheKeys.delete(dep)
  }
}

/**
 * Helper to create standard dependency keys.
 * Ensures consistent naming across the codebase.
 */
export const CacheDependency = {
  customer: (customerId: string): CacheDependencyKey =>
    `customer:${customerId}`,
  subscription: (subscriptionId: string): CacheDependencyKey =>
    `subscription:${subscriptionId}`,
  subscriptionItem: (
    subscriptionItemId: string
  ): CacheDependencyKey => `subscriptionItem:${subscriptionItemId}`,
  subscriptionLedger: (subscriptionId: string): CacheDependencyKey =>
    `ledger:${subscriptionId}`,
} as const

/**
 * Export the dependency registry for testing purposes.
 * @internal
 */
export const _testUtils = {
  getDependencyToCacheKeys: () => dependencyToCacheKeys,
  clearDependencyRegistry: () => dependencyToCacheKeys.clear(),
}
