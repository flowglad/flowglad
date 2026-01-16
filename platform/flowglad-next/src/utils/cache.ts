import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { z } from 'zod'
import type { DbTransaction } from '@/db/types'
import core from './core'
import { logger } from './logger'
import {
  RedisKeyNamespace,
  redis,
  removeFromLRU,
  trackAndEvictLRU,
} from './redis'
import { traced } from './tracing'
import {
  getCurrentTransactionContext,
  runWithTransactionContext,
} from './transactionContext'

const DEFAULT_TTL = 300 // 5 minutes
const DEPENDENCY_REGISTRY_TTL = 86400 // 24 hours - longer than any cache TTL

/**
 * A dependency key is an arbitrary string that represents something
 * that can be invalidated. Examples:
 * - "customer:cust_123" (customer changed)
 * - "subscription:sub_456" (subscription changed)
 * - "subscriptionItem:si_789" (subscription item changed)
 * - "ledger:sub_456" (ledger entries for subscription changed)
 */
export type CacheDependencyKey = string

// Constrain to scalars only - prevents memory explosion
type SerializableScalar = string | number | boolean
type SerializableValue = SerializableScalar | SerializableScalar[]
export type SerializableParams = Record<string, SerializableValue>

// Zod schemas for runtime validation of serializable params
const serializableScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
])
const serializableValueSchema = z.union([
  serializableScalarSchema,
  z.array(serializableScalarSchema),
])
const serializableParamsSchema = z.record(
  z.string(),
  serializableValueSchema
)

/**
 * Transaction context types for cache recomputation.
 * The type discriminator determines what RLS context is needed:
 * - 'admin': No RLS, full database access (for background jobs)
 * - 'merchant': Merchant dashboard context with organization-scoped RLS
 * - 'customer': Customer billing portal context with customer-scoped RLS
 */
export type TransactionContext =
  | { type: 'admin'; livemode: boolean }
  | {
      type: 'merchant'
      livemode: boolean
      organizationId: string
      userId: string
    }
  | {
      type: 'customer'
      livemode: boolean
      organizationId: string
      userId: string
      customerId: string
    }

// Zod schema for transaction context (discriminated union)
const transactionContextSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('admin'),
    livemode: z.boolean(),
  }),
  z.object({
    type: z.literal('merchant'),
    livemode: z.boolean(),
    organizationId: z.string(),
    userId: z.string(),
  }),
  z.object({
    type: z.literal('customer'),
    livemode: z.boolean(),
    organizationId: z.string(),
    userId: z.string(),
    customerId: z.string(),
  }),
])

export interface CacheRecomputeMetadata {
  namespace: RedisKeyNamespace // Used to look up handler in registry
  params: SerializableParams // The params object (sans transaction)
  transactionContext: TransactionContext
  createdAt: number
}

// Zod schema for runtime validation of recompute metadata
const cacheRecomputeMetadataSchema = z.object({
  namespace: z.nativeEnum(RedisKeyNamespace),
  params: serializableParamsSchema,
  transactionContext: transactionContextSchema,
  createdAt: z.number(),
})

export type RecomputeHandler = (
  params: SerializableParams,
  transactionContext: TransactionContext
) => Promise<unknown>

// In-memory registry for recompute handlers. Each process has its own registry,
// but they contain the same handlers because all processes import the same modules
// that call registerRecomputeHandler() as a side effect during module initialization.
const recomputeRegistry = new Map<
  RedisKeyNamespace,
  RecomputeHandler
>()

export function registerRecomputeHandler(
  namespace: RedisKeyNamespace,
  handler: RecomputeHandler
): void {
  recomputeRegistry.set(namespace, handler)
}

export function getRecomputeHandler(
  namespace: RedisKeyNamespace
): RecomputeHandler | undefined {
  return recomputeRegistry.get(namespace)
}

/**
 * Get the Redis key for storing recomputation metadata for a cache key.
 * Metadata is stored in a parallel key: if cache key is "foo:bar",
 * metadata key is "cacheRecompute:foo:bar".
 */
function recomputeMetadataKey(cacheKey: string): string {
  return `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
}

/**
 * Get the Redis key for storing cache keys that depend on a given dependency.
 * Uses Redis Sets to store the mapping: dependency -> Set of cache keys.
 *
 * Example: dependencyRegistryKey("customer:cust_123") returns "cacheDeps:customer:cust_123"
 * The Set at this key contains all cache keys that should be invalidated when
 * customer cust_123 changes.
 */
function dependencyRegistryKey(
  dependency: CacheDependencyKey
): string {
  return `${RedisKeyNamespace.CacheDependencyRegistry}:${dependency}`
}

/**
 * Register that a cache key depends on certain dependency keys.
 * Called internally by the cached combinator after populating the cache.
 *
 * Uses Redis SADD to add the cache key to each dependency's Set.
 * Sets expire after DEPENDENCY_REGISTRY_TTL to prevent unbounded growth
 * from cache keys that were never invalidated.
 */
async function registerDependencies(
  cacheKey: string,
  dependencies: CacheDependencyKey[]
): Promise<void> {
  if (dependencies.length === 0) return

  try {
    const client = redis()
    await Promise.all(
      dependencies.map(async (dep) => {
        const registryKey = dependencyRegistryKey(dep)
        await client.sadd(registryKey, cacheKey)
        // Refresh TTL on the registry key to keep it alive while cache entries exist
        await client.expire(registryKey, DEPENDENCY_REGISTRY_TTL)
      })
    )
  } catch (error) {
    // Log but don't throw - dependency registration is best-effort
    logger.error('Failed to register cache dependencies', {
      cacheKey,
      dependencies,
      error: error instanceof Error ? error.message : String(error),
    })
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
  /**
   * Extract a unique identifier suffix from function arguments.
   * This is combined with namespace to form the full cache key: `${namespace}:${keyFn(args)}`
   *
   * The namespace provides semantic context (e.g., "subscriptionsByCustomer"),
   * while keyFn provides the unique identifier (e.g., "cust_123:true").
   */
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

export interface CacheOptions {
  /** Skip cache lookup and always execute the underlying function. Defaults to false. */
  ignoreCache?: boolean
}

/**
 * Extract CacheOptions and function arguments from a combined args array.
 * The cached combinator accepts an optional CacheOptions as the last argument,
 * so we need to detect and separate it from the actual function arguments.
 */
function extractCacheArgs<TArgs extends unknown[]>(
  args: [...TArgs, CacheOptions?]
): { fnArgs: TArgs; options: CacheOptions } {
  const lastArg = args[args.length - 1]
  const hasOptions =
    lastArg !== null &&
    typeof lastArg === 'object' &&
    'ignoreCache' in lastArg
  const fnArgs = (hasOptions
    ? args.slice(0, -1)
    : args) as unknown as TArgs
  const options: CacheOptions = hasOptions
    ? (lastArg as CacheOptions)
    : {}
  return { fnArgs, options }
}

/**
 * Combinator that adds caching to an async function.
 *
 * Dependency tracking:
 * - When cache is populated, dependencies are registered in Redis via dependenciesFn
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
 *   - cache.ignored: boolean (when cache was bypassed via options)
 * - Logging:
 *   - Debug: cache hit/miss with key
 *   - Warn: schema validation failure (includes key, indicates data corruption)
 *   - Error: Redis operation failure (includes error details)
 *
 * Error handling:
 * - Fails open: Redis errors result in cache miss, not request failure
 * - Schema validation failures treated as cache miss
 *
 * @param config - Cache configuration (namespace, key function, schema, dependencies)
 * @param fn - The underlying function to cache
 * @returns A cached version of the function that accepts an optional CacheOptions as the last argument
 */
export function cached<TArgs extends unknown[], TResult>(
  config: CacheConfig<TArgs, TResult>,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: [...TArgs, CacheOptions?]) => Promise<TResult> {
  return traced(
    {
      options: (...args: [...TArgs, CacheOptions?]) => {
        const { fnArgs } = extractCacheArgs<TArgs>(args)
        return {
          spanName: `cache.${config.namespace}`,
          tracerName: 'cache',
          kind: SpanKind.CLIENT,
          attributes: {
            'cache.namespace': config.namespace,
            'cache.key': config.keyFn(...fnArgs),
          },
        }
      },
      extractResultAttributes: () => ({}),
    },
    async (...args: [...TArgs, CacheOptions?]): Promise<TResult> => {
      const { fnArgs, options } = extractCacheArgs<TArgs>(args)

      const key = config.keyFn(...fnArgs)
      const fullKey = `${config.namespace}:${key}`
      const dependencies = config.dependenciesFn(...fnArgs)
      const span = trace.getActiveSpan()

      // If ignoreCache is set, skip cache lookup entirely
      if (options.ignoreCache) {
        span?.setAttribute('cache.ignored', true)
        logger.debug('Cache ignored', { key: fullKey })
        return fn(...fnArgs)
      }

      // Try to get from cache
      try {
        const redisClient = redis()
        const startTime = Date.now()
        const cachedValue = await redisClient.get(fullKey)
        const latencyMs = Date.now() - startTime

        span?.setAttribute('cache.latency_ms', latencyMs)

        if (cachedValue !== null) {
          // Parse the cached value
          const jsonValue =
            typeof cachedValue === 'string'
              ? JSON.parse(cachedValue)
              : cachedValue

          // Validate with schema
          const parsed = config.schema.safeParse(jsonValue)
          if (parsed.success) {
            span?.setAttribute('cache.hit', true)
            logger.debug('Cache hit', {
              key: fullKey,
              latency_ms: latencyMs,
            })
            logger.info('cache_stats', {
              namespace: config.namespace,
              hit_count: 1,
              miss_count: 0,
              total_count: 1,
              latency_ms: latencyMs,
            })
            return parsed.data
          } else {
            // Schema validation failed - treat as cache miss
            span?.setAttribute('cache.hit', false)
            span?.setAttribute('cache.validation_failed', true)
            logger.warn('Cache schema validation failed', {
              key: fullKey,
              error: parsed.error.message,
            })
            logger.info('cache_stats', {
              namespace: config.namespace,
              hit_count: 0,
              miss_count: 1,
              total_count: 1,
              validation_failed: true,
              latency_ms: latencyMs,
            })
          }
        } else {
          span?.setAttribute('cache.hit', false)
          logger.debug('Cache miss', {
            key: fullKey,
            latency_ms: latencyMs,
          })
          logger.info('cache_stats', {
            namespace: config.namespace,
            hit_count: 0,
            miss_count: 1,
            total_count: 1,
            latency_ms: latencyMs,
          })
        }
      } catch (error) {
        // Fail open - log error and continue to wrapped function
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        span?.setAttribute('cache.hit', false)
        span?.setAttribute('cache.error', errorMessage)
        logger.error('Cache read error', {
          key: fullKey,
          error: errorMessage,
        })
        logger.info('cache_stats', {
          namespace: config.namespace,
          hit_count: 0,
          miss_count: 1,
          total_count: 1,
          error: true,
        })
      }

      // Cache miss - call wrapped function
      const result = await fn(...fnArgs)

      // Store in cache and register dependencies (fire-and-forget)
      try {
        const redisClient = redis()
        const ttl = getTtlForNamespace(config.namespace)
        await redisClient.set(fullKey, JSON.stringify(result), {
          ex: ttl,
        })

        // Register dependencies in Redis
        await registerDependencies(fullKey, dependencies)

        // Track in LRU and evict oldest entries if over limit
        await trackAndEvictLRU(config.namespace, fullKey)

        span?.setAttribute('cache.ttl', ttl)
        span?.setAttribute('cache.dependencies', dependencies)

        logger.debug('Cache populated', {
          key: fullKey,
          ttl,
          dependencies,
        })
      } catch (error) {
        // Fail open - log error but return result
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        span?.setAttribute('cache.error', errorMessage)
        logger.error('Cache write error', {
          key: fullKey,
          error: errorMessage,
        })
      }

      return result
    }
  )
}

/**
 * Configuration for bulk cache operations.
 */
export interface BulkCacheConfig<TKey, TResult> {
  namespace: RedisKeyNamespace
  /** Convert a key to its cache key suffix */
  keyFn: (key: TKey) => string
  /** Zod schema for validating cached data */
  schema: z.ZodType<TResult>
  /** Get dependencies for a single key */
  dependenciesFn: (key: TKey) => CacheDependencyKey[]
}

/**
 * Bulk cache lookup with fallback to a single database query for misses.
 *
 * This optimizes the N+1 cache lookup pattern by:
 * 1. Using Redis MGET to fetch all cache keys in one round-trip
 * 2. Identifying cache misses
 * 3. Calling the bulk fetch function once for all misses
 * 4. Writing back individual cache entries for each miss
 *
 * This provides the best of both worlds:
 * - Fine-grained cache invalidation (per-key)
 * - Efficient bulk database queries (single query for all misses)
 * - Single Redis round-trip for cache lookups
 *
 * @param config - Cache configuration
 * @param keys - Array of keys to look up
 * @param bulkFetchFn - Function to fetch all missing items in one query
 * @param groupByKey - Function to extract the key from a result item (for grouping bulk results)
 * @returns Map of key -> result (empty array if no items for that key)
 */
export async function cachedBulkLookup<TKey, TResult>(
  config: BulkCacheConfig<TKey, TResult[]>,
  keys: TKey[],
  bulkFetchFn: (keys: TKey[]) => Promise<TResult[]>,
  groupByKey: (item: TResult) => TKey
): Promise<Map<TKey, TResult[]>> {
  if (keys.length === 0) {
    return new Map()
  }

  const tracer = trace.getTracer('cache')
  return tracer.startActiveSpan(
    `cache.bulk.${config.namespace}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('cache.namespace', config.namespace)
      span.setAttribute('cache.bulk', true)
      span.setAttribute('cache.key_count', keys.length)

      const startTime = Date.now()
      try {
        const result = await cachedBulkLookupImpl(
          config,
          keys,
          bulkFetchFn,
          groupByKey,
          span
        )
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        throw error
      } finally {
        span.setAttribute('duration_ms', Date.now() - startTime)
        span.end()
      }
    }
  )
}

async function cachedBulkLookupImpl<TKey, TResult>(
  config: BulkCacheConfig<TKey, TResult[]>,
  keys: TKey[],
  bulkFetchFn: (keys: TKey[]) => Promise<TResult[]>,
  groupByKey: (item: TResult) => TKey,
  span: ReturnType<ReturnType<typeof trace.getTracer>['startSpan']>
): Promise<Map<TKey, TResult[]>> {
  const ttl = getTtlForNamespace(config.namespace)

  // Build cache keys for all input keys
  const cacheKeyMap = new Map<string, TKey>()
  const fullCacheKeys: string[] = []
  for (const key of keys) {
    const suffix = config.keyFn(key)
    const fullKey = `${config.namespace}:${suffix}`
    cacheKeyMap.set(fullKey, key)
    fullCacheKeys.push(fullKey)
  }

  const results = new Map<TKey, TResult[]>()
  const missedKeys: TKey[] = []

  // Step 1: Bulk fetch from cache using MGET
  try {
    const redisClient = redis()
    const startTime = Date.now()
    const cachedValues = (await redisClient.mget(
      ...fullCacheKeys
    )) as (TResult[] | null)[]
    const latencyMs = Date.now() - startTime

    span.setAttribute('cache.bulk_lookup_count', keys.length)
    span.setAttribute('cache.bulk_latency_ms', latencyMs)

    // Process cached values
    let hitCount = 0
    for (let i = 0; i < fullCacheKeys.length; i++) {
      const fullKey = fullCacheKeys[i]
      const key = cacheKeyMap.get(fullKey)!
      const cachedValue = cachedValues[i]

      if (cachedValue !== null) {
        try {
          // Parse and validate
          const jsonValue =
            typeof cachedValue === 'string'
              ? JSON.parse(cachedValue)
              : cachedValue

          const parsed = config.schema.safeParse(jsonValue)
          if (parsed.success) {
            results.set(key, parsed.data)
            hitCount++
          } else {
            // Schema validation failed - treat as miss
            logger.warn('Bulk cache schema validation failed', {
              key: fullKey,
              error: parsed.error.message,
            })
            missedKeys.push(key)
          }
        } catch (parseError) {
          // JSON.parse failed - treat as miss (corrupted cache data)
          logger.warn('Bulk cache JSON parse failed', {
            key: fullKey,
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          })
          missedKeys.push(key)
        }
      } else {
        missedKeys.push(key)
      }
    }

    span.setAttribute('cache.hit', missedKeys.length === 0)
    span.setAttribute('cache.bulk_hit_count', hitCount)
    span.setAttribute('cache.bulk_miss_count', missedKeys.length)

    logger.debug('Bulk cache lookup', {
      namespace: config.namespace,
      totalKeys: keys.length,
      hits: hitCount,
      misses: missedKeys.length,
      latency_ms: latencyMs,
    })
    logger.info('cache_stats', {
      namespace: config.namespace,
      bulk: true,
      hit_count: hitCount,
      miss_count: missedKeys.length,
      total_count: keys.length,
      latency_ms: latencyMs,
    })
  } catch (error) {
    // Fail open - all keys become misses
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    span.setAttribute('cache.hit', false)
    span.setAttribute('cache.bulk_error', errorMessage)
    logger.error('Bulk cache read error', {
      namespace: config.namespace,
      error: errorMessage,
    })
    logger.info('cache_stats', {
      namespace: config.namespace,
      bulk: true,
      hit_count: 0,
      miss_count: keys.length,
      total_count: keys.length,
      error: true,
    })
    missedKeys.push(...keys)
  }

  // Step 2: Bulk fetch from database for misses
  if (missedKeys.length > 0) {
    try {
      const fetchedItems = await bulkFetchFn(missedKeys)

      // Group fetched items by key
      const fetchedByKey = new Map<TKey, TResult[]>()
      for (const key of missedKeys) {
        fetchedByKey.set(key, [])
      }
      for (const item of fetchedItems) {
        const key = groupByKey(item)
        const existing = fetchedByKey.get(key)
        if (existing) {
          existing.push(item)
        }
      }

      // Add to results and write to cache
      const writeClient = redis()
      for (const [key, items] of fetchedByKey) {
        results.set(key, items)

        // Write to cache (fire-and-forget)
        const suffix = config.keyFn(key)
        const fullKey = `${config.namespace}:${suffix}`
        const dependencies = config.dependenciesFn(key)

        try {
          await writeClient.set(fullKey, JSON.stringify(items), {
            ex: ttl,
          })
          await registerDependencies(fullKey, dependencies)
          // Track in LRU and evict oldest entries if over limit
          await trackAndEvictLRU(config.namespace, fullKey)
        } catch (writeError) {
          // Log but don't fail
          logger.error('Bulk cache write error', {
            key: fullKey,
            error:
              writeError instanceof Error
                ? writeError.message
                : String(writeError),
          })
        }
      }
    } catch (fetchError) {
      // Database fetch errors are critical - re-throw
      // (Unlike cache read errors which fail-open, we can't serve stale data for misses)
      const errorMessage =
        fetchError instanceof Error
          ? fetchError.message
          : String(fetchError)
      logger.error('Bulk fetch error', {
        missedKeys: missedKeys.length,
        error: errorMessage,
      })
      throw fetchError
    }
  }

  // Ensure all keys have entries (empty array for keys with no items)
  for (const key of keys) {
    if (!results.has(key)) {
      results.set(key, [])
    }
  }

  return results
}

/**
 * Invalidate all cache entries that depend on the given dependency keys.
 *
 * This is the core invalidation function. It:
 * 1. For each dependency, uses SMEMBERS to get all cache keys from Redis Set
 * 2. Deletes all those cache keys from Redis
 *
 * Note: The dependency registry Sets are NOT deleted here - they are left to
 * expire via TTL. This allows recomputeDependencies() to be called after
 * invalidation to trigger recomputation of cache entries that have metadata.
 *
 * Observability:
 * - Logs invalidation at debug level (includes dependency and cache keys)
 * - Logs errors but does not throw (fire-and-forget)
 */
export async function invalidateDependencies(
  dependencies: CacheDependencyKey[]
): Promise<void> {
  if (dependencies.length === 0) return

  const client = redis()
  try {
    for (const dep of dependencies) {
      const registryKey = dependencyRegistryKey(dep)
      // Get all cache keys that depend on this dependency
      const cacheKeys = await client.smembers(registryKey)

      if (cacheKeys.length > 0) {
        logger.info('cache_invalidation', {
          dependency: dep,
          cacheKeys,
          invalidation_count: cacheKeys.length,
        })
        // Delete all the cache keys (but NOT the registry Set - it expires via TTL
        // and is needed by recomputeDependencies if called afterward)
        await client.del(...cacheKeys)

        // Remove invalidated keys from LRU tracking
        // Cache key format is "namespace:suffix", so extract namespace
        for (const cacheKey of cacheKeys) {
          const colonIndex = cacheKey.indexOf(':')
          if (colonIndex > 0) {
            const namespace = cacheKey.slice(0, colonIndex)
            // Only remove if it's a known namespace (avoid removing dependency registry keys)
            if (
              Object.values(RedisKeyNamespace).includes(
                namespace as RedisKeyNamespace
              )
            ) {
              await removeFromLRU(
                namespace as RedisKeyNamespace,
                cacheKey
              )
            }
          }
        }
      } else {
        logger.debug('No cache keys to invalidate for dependency', {
          dependency: dep,
        })
      }
    }
  } catch (error) {
    // Log but don't throw - invalidation is fire-and-forget
    logger.error('Failed to invalidate cache dependencies', {
      dependencies,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Recompute a single cache entry using stored metadata.
 *
 * This function:
 * 1. Looks up recomputation metadata for the cache key
 * 2. If found, looks up the registered handler for that namespace
 * 3. Calls the handler with the stored params and transaction context
 *
 * Error handling:
 * - If metadata not found: no-op (entry wasn't recomputable)
 * - If handler not registered: logs warning (process may not have loaded the module)
 * - If handler throws: logs warning, does not propagate (fail open)
 */
export async function recomputeCacheEntry(
  cacheKey: string
): Promise<void> {
  const client = redis()

  try {
    // Get recomputation metadata
    const metadataKey = recomputeMetadataKey(cacheKey)
    const rawMetadata = await client.get(metadataKey)

    if (rawMetadata === null) {
      // No metadata means this wasn't a recomputable cache entry
      logger.debug('No recompute metadata for cache key', {
        cacheKey,
      })
      return
    }

    // Parse and validate metadata with Zod schema
    const jsonValue =
      typeof rawMetadata === 'string'
        ? JSON.parse(rawMetadata)
        : rawMetadata
    const parsed = cacheRecomputeMetadataSchema.safeParse(jsonValue)

    if (!parsed.success) {
      logger.warn('Invalid recompute metadata', {
        cacheKey,
        error: parsed.error.message,
      })
      return
    }

    const metadata = parsed.data

    // Look up handler in registry
    const handler = getRecomputeHandler(metadata.namespace)

    if (!handler) {
      logger.warn('No recompute handler registered for namespace', {
        namespace: metadata.namespace,
        cacheKey,
      })
      return
    }

    // Call handler with stored params and context
    await handler(metadata.params, metadata.transactionContext)

    logger.debug('Recomputed cache entry', {
      cacheKey,
      namespace: metadata.namespace,
    })
  } catch (error) {
    // Fail open - log warning but don't propagate
    logger.warn('Failed to recompute cache entry', {
      cacheKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Recompute all cache entries associated with the given dependencies.
 *
 * This function:
 * 1. Collects all cache keys from all dependencies
 * 2. Deduplicates the cache keys (same key may appear in multiple dependency sets)
 * 3. Triggers recomputation for each unique cache key
 *
 * Called after invalidateDependencies() to trigger fire-and-forget recomputation
 * for any cache entries that have recomputation metadata.
 */
export async function recomputeDependencies(
  dependencies: CacheDependencyKey[]
): Promise<void> {
  if (dependencies.length === 0) return

  const client = redis()

  try {
    // Collect all cache keys from all dependencies, deduplicating
    const allCacheKeys = new Set<string>()

    for (const dep of dependencies) {
      const registryKey = dependencyRegistryKey(dep)
      const cacheKeys = await client.smembers(registryKey)
      for (const key of cacheKeys) {
        allCacheKeys.add(key)
      }
    }

    if (allCacheKeys.size === 0) {
      logger.debug('No cache keys to recompute for dependencies', {
        dependencies,
      })
      return
    }

    // Trigger recomputation for each unique cache key (fire-and-forget)
    const recomputePromises = [...allCacheKeys].map((cacheKey) =>
      recomputeCacheEntry(cacheKey)
    )
    await Promise.all(recomputePromises)

    logger.debug('Triggered recomputation for dependencies', {
      dependencies,
      cacheKeyCount: allCacheKeys.size,
    })
  } catch (error) {
    // Log but don't throw - recomputation is best-effort
    logger.error('Failed to recompute dependencies', {
      dependencies,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Helper to create standard dependency keys.
 * Ensures consistent naming across the codebase.
 *
 * Dependencies should be semantically precise - describing what data is being cached,
 * not just what entity owns it. This allows for granular invalidation:
 * - `customerSubscriptions:cust_123` invalidates when subscriptions for this customer change
 * - `subscriptionItems:sub_456` invalidates when items for this subscription change
 * - etc.
 */
export const CacheDependency = {
  /** Invalidate when subscriptions for this customer change (create/update/delete) */
  customerSubscriptions: (customerId: string): CacheDependencyKey =>
    `customerSubscriptions:${customerId}`,
  /** Invalidate when items for this subscription change */
  subscriptionItems: (subscriptionId: string): CacheDependencyKey =>
    `subscriptionItems:${subscriptionId}`,
  /** Invalidate when features for this subscription item change */
  subscriptionItemFeatures: (
    subscriptionItemId: string
  ): CacheDependencyKey =>
    `subscriptionItemFeatures:${subscriptionItemId}`,
  /** Invalidate when ledger entries for this subscription change */
  subscriptionLedger: (subscriptionId: string): CacheDependencyKey =>
    `subscriptionLedger:${subscriptionId}`,
} as const

/**
 * Signature constraint for recomputable cached functions.
 * Enforces (params, transaction) pattern for clean serialization.
 *
 * Why this pattern?
 * - Params are always serializable (enforced by SerializableParams)
 * - Transaction is ephemeral and reconstructed during recomputation
 * - No need for serializeArgsFn - params are inherently serializable
 */
type RecomputableFn<TParams extends SerializableParams, TResult> = (
  params: TParams,
  transaction: DbTransaction
) => Promise<TResult>

/**
 * Configuration for recomputable cached functions.
 * Similar to CacheConfig but enforces the (params, transaction) signature.
 */
export interface RecomputableCacheConfig<
  TParams extends SerializableParams,
  TResult,
> {
  namespace: RedisKeyNamespace
  /** Zod schema for validating params - used during recomputation */
  paramsSchema: z.ZodType<TParams>
  /** Extract a unique cache key suffix from params */
  keyFn: (params: TParams) => string
  /** Zod schema for validating cached data */
  schema: z.ZodType<TResult>
  /** Declare dependency keys for invalidation */
  dependenciesFn: (params: TParams) => CacheDependencyKey[]
}

/**
 * Combinator that adds caching with automatic recomputation support.
 *
 * Unlike `cached()`, this combinator:
 * 1. Enforces a (params, transaction) signature for clean serialization
 * 2. Auto-registers a recomputation handler in the registry
 * 3. Stores recomputation metadata alongside cache entries
 *
 * When invalidateDependencies() + recomputeDependencies() is called,
 * cache entries created by this combinator will be automatically
 * recomputed using the stored params and transaction context.
 *
 * IMPORTANT: Only use for READ operations. Side-effect functions
 * (those that emit events or ledger commands) must use `cached()` instead.
 *
 * @param config - Cache configuration
 * @param fn - The underlying function (params, transaction) => Promise<TResult>
 * @returns A cached version that auto-registers recomputation
 */
export function cachedRecomputable<
  TParams extends SerializableParams,
  TResult,
>(
  config: RecomputableCacheConfig<TParams, TResult>,
  fn: RecomputableFn<TParams, TResult>
): RecomputableFn<TParams, TResult> {
  // Create the cached wrapper first so the handler can reference it
  const cachedWrapper: RecomputableFn<TParams, TResult> = traced(
    {
      options: (params: TParams, _transaction: DbTransaction) => ({
        spanName: `cache.recomputable.${config.namespace}`,
        tracerName: 'cache',
        kind: SpanKind.CLIENT,
        attributes: {
          'cache.namespace': config.namespace,
          'cache.key': config.keyFn(params),
          'cache.recomputable': true,
        },
      }),
      extractResultAttributes: () => ({}),
    },
    async (
      params: TParams,
      transaction: DbTransaction
    ): Promise<TResult> => {
      const key = config.keyFn(params)
      const fullKey = `${config.namespace}:${key}`
      const dependencies = config.dependenciesFn(params)
      const span = trace.getActiveSpan()

      // Try to get from cache
      try {
        const redisClient = redis()
        const startTime = Date.now()
        const cachedValue = await redisClient.get(fullKey)
        const latencyMs = Date.now() - startTime

        span?.setAttribute('cache.latency_ms', latencyMs)

        if (cachedValue !== null) {
          // Parse the cached value
          const jsonValue =
            typeof cachedValue === 'string'
              ? JSON.parse(cachedValue)
              : cachedValue

          // Validate with schema
          const parsed = config.schema.safeParse(jsonValue)
          if (parsed.success) {
            span?.setAttribute('cache.hit', true)
            logger.debug('Cache hit (recomputable)', {
              key: fullKey,
              latency_ms: latencyMs,
            })
            logger.info('cache_stats', {
              namespace: config.namespace,
              hit_count: 1,
              miss_count: 0,
              total_count: 1,
              latency_ms: latencyMs,
              recomputable: true,
            })
            return parsed.data
          } else {
            // Schema validation failed - treat as cache miss
            span?.setAttribute('cache.hit', false)
            span?.setAttribute('cache.validation_failed', true)
            logger.warn(
              'Cache schema validation failed (recomputable)',
              {
                key: fullKey,
                error: parsed.error.message,
              }
            )
            logger.info('cache_stats', {
              namespace: config.namespace,
              hit_count: 0,
              miss_count: 1,
              total_count: 1,
              validation_failed: true,
              latency_ms: latencyMs,
              recomputable: true,
            })
          }
        } else {
          span?.setAttribute('cache.hit', false)
          logger.debug('Cache miss (recomputable)', {
            key: fullKey,
            latency_ms: latencyMs,
          })
          logger.info('cache_stats', {
            namespace: config.namespace,
            hit_count: 0,
            miss_count: 1,
            total_count: 1,
            latency_ms: latencyMs,
            recomputable: true,
          })
        }
      } catch (error) {
        // Fail open - log error and continue to wrapped function
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        span?.setAttribute('cache.hit', false)
        span?.setAttribute('cache.error', errorMessage)
        logger.error('Cache read error (recomputable)', {
          key: fullKey,
          error: errorMessage,
        })
        logger.info('cache_stats', {
          namespace: config.namespace,
          hit_count: 0,
          miss_count: 1,
          total_count: 1,
          error: true,
          recomputable: true,
        })
      }

      // Cache miss - call wrapped function
      const result = await fn(params, transaction)

      // Store in cache, metadata, and register dependencies (fire-and-forget)
      try {
        const redisClient = redis()
        const ttl = getTtlForNamespace(config.namespace)

        // Store the cache value
        await redisClient.set(fullKey, JSON.stringify(result), {
          ex: ttl,
        })

        // Store recomputation metadata (if we have transaction context)
        const transactionContext = getCurrentTransactionContext()
        if (transactionContext) {
          const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${fullKey}`
          const metadata: CacheRecomputeMetadata = {
            namespace: config.namespace,
            params,
            transactionContext,
            createdAt: Date.now(),
          }
          await redisClient.set(
            metadataKey,
            JSON.stringify(metadata),
            { ex: ttl }
          )
          span?.setAttribute('cache.metadata_stored', true)
        } else {
          // No transaction context available - can't store recompute metadata
          // This happens if called outside of a transaction wrapper
          logger.debug(
            'No transaction context for recompute metadata',
            { key: fullKey }
          )
          span?.setAttribute('cache.metadata_stored', false)
        }

        // Register dependencies in Redis
        await registerDependencies(fullKey, dependencies)

        // Track in LRU and evict oldest entries if over limit
        await trackAndEvictLRU(config.namespace, fullKey)

        span?.setAttribute('cache.ttl', ttl)
        span?.setAttribute('cache.dependencies', dependencies)

        logger.debug('Cache populated (recomputable)', {
          key: fullKey,
          ttl,
          dependencies,
          hasMetadata: !!transactionContext,
        })
      } catch (error) {
        // Fail open - log error but return result
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        span?.setAttribute('cache.error', errorMessage)
        logger.error('Cache write error (recomputable)', {
          key: fullKey,
          error: errorMessage,
        })
      }

      return result
    }
  )

  // Auto-register recomputation handler after wrapper is defined.
  // All processes import the same modules, so all registries will have the same handlers.
  const handler: RecomputeHandler = async (
    params,
    transactionContext
  ) => {
    // Validate params using the schema to ensure type safety
    const validatedParams = config.paramsSchema.parse(params)

    // Set up transaction context and call the cached wrapper (not fn directly)
    // so cache repopulation and TTL refresh occur
    if (transactionContext.type === 'admin') {
      const { adminTransaction } = await import(
        '@/db/adminTransaction'
      )
      return adminTransaction(
        async ({ transaction }) => {
          // Run within transaction context so metadata can be stored
          return runWithTransactionContext(transactionContext, () =>
            cachedWrapper(validatedParams, transaction)
          )
        },
        { livemode: transactionContext.livemode }
      )
    } else if (transactionContext.type === 'merchant') {
      const { recomputeWithMerchantContext } = await import(
        '@/db/recomputeTransaction'
      )
      return recomputeWithMerchantContext(
        transactionContext,
        async (transaction) =>
          runWithTransactionContext(transactionContext, () =>
            cachedWrapper(validatedParams, transaction)
          )
      )
    } else {
      // transactionContext.type === 'customer'
      const { recomputeWithCustomerContext } = await import(
        '@/db/recomputeTransaction'
      )
      return recomputeWithCustomerContext(
        transactionContext,
        async (transaction) =>
          runWithTransactionContext(transactionContext, () =>
            cachedWrapper(validatedParams, transaction)
          )
      )
    }
  }
  registerRecomputeHandler(config.namespace, handler)

  return cachedWrapper
}
