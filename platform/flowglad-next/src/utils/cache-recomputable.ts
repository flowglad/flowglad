/**
 * Server-only cache recomputation module.
 *
 * This module contains cachedRecomputable() which requires database access
 * for recomputation. It should only be imported by server-side code.
 *
 * For client-safe caching utilities, import from './cache' instead.
 */
import 'server-only'

import { SpanKind, trace } from '@opentelemetry/api'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import {
  recomputeWithCustomerContext,
  recomputeWithMerchantContext,
} from '@/db/recomputeTransaction'
import type { DbTransaction } from '@/db/types'
import {
  type CacheDependencyKey,
  type CacheRecomputeMetadata,
  getTtlForNamespace,
  logCacheStats,
  type RecomputeHandler,
  registerRecomputeHandler,
  type SerializableParams,
  type TransactionContext,
} from './cache'
import { logger } from './logger'
import { RedisKeyNamespace, redis, trackAndEvictLRU } from './redis'
import { traced } from './tracing'

/**
 * Register that a cache key depends on certain dependency keys.
 * Called internally by the cached combinator after populating the cache.
 *
 * Uses Redis SADD to add the cache key to each dependency's Set.
 * Sets expire after DEPENDENCY_REGISTRY_TTL to prevent unbounded growth
 * from cache keys that were never invalidated.
 */
const DEPENDENCY_REGISTRY_TTL = 86400 // 24 hours - longer than any cache TTL

async function registerDependencies(
  cacheKey: string,
  dependencies: CacheDependencyKey[]
): Promise<void> {
  if (dependencies.length === 0) return

  try {
    const client = redis()
    await Promise.all(
      dependencies.map(async (dep) => {
        const registryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:${dep}`
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

interface PopulateRecomputableCacheParams {
  fullKey: string
  result: unknown
  dependencies: CacheDependencyKey[]
  namespace: RedisKeyNamespace
  recomputable: boolean
  params: SerializableParams
  transactionContext: TransactionContext
}

/**
 * Populate cache with a value and store recomputation metadata.
 *
 * Extends populateCache by also storing metadata for cache recomputation.
 * Always fails open - errors are logged but not thrown.
 */
async function populateRecomputableCache(
  cacheParams: PopulateRecomputableCacheParams
): Promise<void> {
  const {
    fullKey,
    result,
    dependencies,
    namespace,
    params,
    transactionContext,
  } = cacheParams
  const span = trace.getActiveSpan()

  try {
    const redisClient = redis()
    const ttl = getTtlForNamespace(namespace)

    // Store the cache value
    await redisClient.set(fullKey, JSON.stringify(result), {
      ex: ttl,
    })

    // Store recomputation metadata
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${fullKey}`
    const metadata: CacheRecomputeMetadata = {
      namespace,
      params,
      transactionContext,
      createdAt: Date.now(),
    }
    await redisClient.set(metadataKey, JSON.stringify(metadata), {
      ex: ttl,
    })
    span?.setAttribute('cache.metadata_stored', true)

    // Register dependencies in Redis
    await registerDependencies(fullKey, dependencies)

    // Track in LRU and evict oldest entries if over limit
    await trackAndEvictLRU(namespace, fullKey)

    span?.setAttribute('cache.ttl', ttl)
    span?.setAttribute('cache.dependencies', dependencies)

    logger.debug('Cache populated (recomputable)', {
      key: fullKey,
      ttl,
      dependencies,
    })
  } catch (error) {
    // Fail open - log error but don't throw
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    span?.setAttribute('cache.error', errorMessage)
    logger.error('Cache write error (recomputable)', {
      key: fullKey,
      error: errorMessage,
    })
  }
}

/**
 * Attempt to read a value from cache with schema validation.
 * Duplicated here to avoid circular dependencies.
 */
async function tryGetFromCache<T>(
  fullKey: string,
  schema: z.ZodType<T>,
  namespace: RedisKeyNamespace
): Promise<{ hit: true; data: T } | { hit: false }> {
  const startTime = performance.now()
  try {
    const redisClient = redis()
    const cachedValue = await redisClient.get(fullKey)
    const latencyMs = performance.now() - startTime

    if (cachedValue !== null) {
      const jsonValue =
        typeof cachedValue === 'string'
          ? JSON.parse(cachedValue)
          : cachedValue

      const parsed = schema.safeParse(jsonValue)
      if (parsed.success) {
        logger.debug('Cache hit (recomputable)', {
          key: fullKey,
          latency_ms: latencyMs,
        })
        logCacheStats({
          namespace,
          hit: true,
          latencyMs,
          recomputable: true,
        })
        return { hit: true, data: parsed.data }
      } else {
        logger.warn('Cache schema validation failed (recomputable)', {
          key: fullKey,
          error: parsed.error.message,
        })
        logCacheStats({
          namespace,
          hit: false,
          latencyMs,
          validationFailed: true,
          recomputable: true,
        })
        return { hit: false }
      }
    }
    logger.debug('Cache miss (recomputable)', {
      key: fullKey,
      latency_ms: latencyMs,
    })
    logCacheStats({
      namespace,
      hit: false,
      latencyMs,
      recomputable: true,
    })
    return { hit: false }
  } catch (error) {
    const latencyMs = performance.now() - startTime
    logger.error('Cache read error (recomputable)', {
      key: fullKey,
      error: error instanceof Error ? error.message : String(error),
    })
    logCacheStats({
      namespace,
      hit: false,
      latencyMs,
      error: true,
      recomputable: true,
    })
    return { hit: false }
  }
}

/**
 * Signature constraint for recomputable cached functions.
 * Enforces (params, transaction, transactionContext) pattern for clean serialization.
 *
 * Why this pattern?
 * - Params are always serializable (enforced by SerializableParams)
 * - Transaction is ephemeral and reconstructed during recomputation
 * - TransactionContext is explicitly passed to avoid AsyncLocalStorage dependency
 * - No need for serializeArgsFn - params are inherently serializable
 */
type RecomputableFn<TParams extends SerializableParams, TResult> = (
  params: TParams,
  transaction: DbTransaction,
  transactionContext: TransactionContext
) => Promise<TResult>

/**
 * Configuration for recomputable cached functions.
 * Similar to CacheConfig but enforces the (params, transaction, transactionContext) signature.
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
 * 1. Enforces a (params, transaction, transactionContext) signature for clean serialization
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
 * NOTE: This function is server-only. Import from './cache-recomputable' only
 * in server-side code. For client-safe caching, use `cached()` from './cache'.
 *
 * @param config - Cache configuration
 * @param fn - The underlying function (params, transaction, transactionContext) => Promise<TResult>
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
      options: (
        params: TParams,
        _transaction: DbTransaction,
        _transactionContext: TransactionContext
      ) => ({
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
      transaction: DbTransaction,
      transactionContext: TransactionContext
    ): Promise<TResult> => {
      const key = config.keyFn(params)
      const fullKey = `${config.namespace}:${key}`
      const dependencies = config.dependenciesFn(params)

      // Try to get from cache
      const cacheResult = await tryGetFromCache(
        fullKey,
        config.schema,
        config.namespace
      )

      if (cacheResult.hit) {
        return cacheResult.data
      }

      // Cache miss - call wrapped function
      const result = await fn(params, transaction, transactionContext)

      // Store in cache, metadata, and register dependencies (fire-and-forget)
      await populateRecomputableCache({
        fullKey,
        result,
        dependencies,
        namespace: config.namespace,
        recomputable: true,
        params,
        transactionContext,
      })

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
      return adminTransaction(
        async ({ transaction }) => {
          return cachedWrapper(
            validatedParams,
            transaction,
            transactionContext
          )
        },
        { livemode: transactionContext.livemode }
      )
    } else if (transactionContext.type === 'merchant') {
      return recomputeWithMerchantContext(
        transactionContext,
        async (transaction) =>
          cachedWrapper(
            validatedParams,
            transaction,
            transactionContext
          )
      )
    } else {
      // transactionContext.type === 'customer'
      return recomputeWithCustomerContext(
        transactionContext,
        async (transaction) =>
          cachedWrapper(
            validatedParams,
            transaction,
            transactionContext
          )
      )
    }
  }
  registerRecomputeHandler(config.namespace, handler)

  return cachedWrapper
}
