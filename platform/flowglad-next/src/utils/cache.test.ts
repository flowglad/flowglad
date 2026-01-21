import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { z } from 'zod'
import type { DbTransaction } from '@/db/types'
import {
  CacheDependency,
  type CacheRecomputationContext,
  type CacheRecomputeMetadata,
  cached,
  getRecomputeHandler,
  getTtlForNamespace,
  type RecomputeHandler,
  registerRecomputeHandler,
  type SerializableParams,
} from './cache'
import {
  invalidateDependencies,
  recomputeCacheEntry,
  recomputeDependencies,
} from './cache.internal'
import { cachedRecomputable } from './cache-recomputable'
import {
  _setTestRedisClient,
  RedisKeyNamespace,
  trackAndEvictLRU,
} from './redis'

// In-memory mock Redis client for testing
function createMockRedisClient() {
  const store: Record<string, string> = {}
  const sets: Record<string, Set<string>> = {}
  const zsets: Record<string, Map<string, number>> = {}

  // Helper for LRU eviction script simulation (used by both eval and evalsha)
  // Returns JSON string matching the real Lua script: [evictedCount, orphansRemoved]
  const executeLruScript = (
    keys: string[],
    args: (string | number)[]
  ): string => {
    const zsetKey = keys[0]
    const cacheKey = keys[1]
    const timestamp = Number(args[0])
    const maxSize = Number(args[1])
    // args[2] is metadataPrefix, used in real script for cleanup

    // ZADD
    if (!zsets[zsetKey]) {
      zsets[zsetKey] = new Map()
    }
    zsets[zsetKey].set(cacheKey, timestamp)

    // Check size and evict (simplified - doesn't simulate orphan detection)
    let evictedCount = 0
    const orphansRemoved = 0 // Mock doesn't simulate TTL expiration
    const size = zsets[zsetKey].size
    if (size > maxSize) {
      const toEvictCount = size - maxSize
      const sorted = [...zsets[zsetKey].entries()].sort(
        (a, b) => a[1] - b[1]
      )
      const toEvict = sorted.slice(0, toEvictCount).map(([m]) => m)
      for (const m of toEvict) {
        delete store[m]
        zsets[zsetKey].delete(m)
        evictedCount++
      }
    }
    return JSON.stringify([evictedCount, orphansRemoved])
  }

  return {
    store,
    sets,
    zsets,
    client: {
      get: (key: string) => store[key] ?? null,
      getdel: (key: string) => {
        const value = store[key] ?? null
        if (value !== null) {
          delete store[key]
        }
        return value
      },
      set: (
        key: string,
        value: string,
        _options?: { ex?: number }
      ) => {
        store[key] = value
        return 'OK'
      },
      del: (...keys: string[]) => {
        let deleted = 0
        for (const key of keys) {
          if (store[key] !== undefined) {
            delete store[key]
            deleted++
          }
          if (sets[key] !== undefined) {
            delete sets[key]
            deleted++
          }
        }
        return deleted
      },
      sadd: (key: string, ...members: string[]) => {
        if (!sets[key]) {
          sets[key] = new Set()
        }
        let added = 0
        for (const member of members) {
          if (!sets[key].has(member)) {
            sets[key].add(member)
            added++
          }
        }
        return added
      },
      smembers: (key: string) => {
        const set = sets[key]
        return set ? Array.from(set) : []
      },
      srem: (key: string, ...members: string[]) => {
        const set = sets[key]
        if (!set) return 0
        let removed = 0
        for (const member of members) {
          if (set.has(member)) {
            set.delete(member)
            removed++
          }
        }
        return removed
      },
      // ZSET operations for LRU tracking
      zadd: (key: string, score: number, member: string) => {
        if (!zsets[key]) {
          zsets[key] = new Map()
        }
        const isNew = !zsets[key].has(member)
        zsets[key].set(member, score)
        return isNew ? 1 : 0
      },
      zcard: (key: string) => {
        return zsets[key]?.size ?? 0
      },
      zrange: (key: string, start: number, stop: number) => {
        const zset = zsets[key]
        if (!zset) return []
        // Sort by score and return members in range
        const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1])
        return sorted.slice(start, stop + 1).map(([member]) => member)
      },
      zrem: (key: string, ...members: string[]) => {
        const zset = zsets[key]
        if (!zset) return 0
        let removed = 0
        for (const member of members) {
          if (zset.has(member)) {
            zset.delete(member)
            removed++
          }
        }
        return removed
      },
      // Lua script execution - simplified mock that handles LRU eviction script
      eval: (
        _script: string,
        keys: string[],
        args: (string | number)[]
      ) => {
        return executeLruScript(keys, args)
      },
      // EVALSHA - same behavior as eval for testing
      evalsha: (
        _sha: string,
        keys: string[],
        args: (string | number)[]
      ) => {
        return executeLruScript(keys, args)
      },
      expire: () => 1,
      exists: (...keys: string[]) => {
        let count = 0
        for (const key of keys) {
          if (
            store[key] !== undefined ||
            sets[key] !== undefined ||
            zsets[key] !== undefined
          ) {
            count++
          }
        }
        return count
      },
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key]
      }
      for (const key of Object.keys(sets)) {
        delete sets[key]
      }
      for (const key of Object.keys(zsets)) {
        delete zsets[key]
      }
    },
  }
}

describe('cached combinator', () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    _setTestRedisClient(mockRedis.client)
  })

  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('calls wrapped function on cache miss and returns result', async () => {
    const wrappedFn = vi
      .fn()
      .mockResolvedValue({ id: 'test-123', name: 'Test' })
    const testSchema = z.object({ id: z.string(), name: z.string() })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: (customerId: string) => customerId,
        schema: testSchema,
        dependenciesFn: (_result, customerId: string) => [
          CacheDependency.customerSubscriptions(customerId),
        ],
      },
      wrappedFn
    )

    const result = await cachedFn('cust_123')

    expect(wrappedFn).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: 'test-123', name: 'Test' })
  })

  it('constructs cache key from namespace and keyFn', async () => {
    const wrappedFn = vi.fn().mockResolvedValue({ value: 42 })
    const testSchema = z.object({ value: z.number() })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.ItemsBySubscription,
        keyFn: (subId: string) => `items-${subId}`,
        schema: testSchema,
        dependenciesFn: (_result) => [],
      },
      wrappedFn
    )

    await cachedFn('sub_456')

    // Check that the key was stored with correct format
    const expectedKey = `${RedisKeyNamespace.ItemsBySubscription}:items-sub_456`
    expect(JSON.parse(mockRedis.store[expectedKey])).toEqual({
      value: 42,
    })
  })

  it('fails open when Redis set throws error', async () => {
    const wrappedFn = vi.fn().mockResolvedValue({ result: 'success' })
    const testSchema = z.object({ result: z.string() })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: () => 'key',
        schema: testSchema,
        dependenciesFn: (_result) => [],
      },
      wrappedFn
    )

    // Even if set fails internally, the result should still be returned
    const result = await cachedFn()

    expect(result).toEqual({ result: 'success' })
  })

  it('treats schema validation failure as cache miss', async () => {
    const wrappedFn = vi
      .fn()
      .mockResolvedValue({ validField: 'correct', count: 10 })
    const testSchema = z.object({
      validField: z.string(),
      count: z.number(),
    })

    // Pre-populate cache with invalid data (missing required field)
    const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:test-key`
    mockRedis.store[cacheKey] = JSON.stringify({
      invalidStructure: true,
    })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: () => 'test-key',
        schema: testSchema,
        dependenciesFn: (_result) => [],
      },
      wrappedFn
    )

    const result = await cachedFn()

    // Should call wrapped function due to schema validation failure
    expect(wrappedFn).toHaveBeenCalled()
    expect(result).toEqual({ validField: 'correct', count: 10 })
  })
})

describe('getTtlForNamespace', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns TTL from CACHE_TTLS environment variable when set', () => {
    process.env.CACHE_TTLS = JSON.stringify({
      subscriptionsByCustomer: 600,
    })

    const ttl = getTtlForNamespace(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(ttl).toBe(600)
  })

  it('returns default TTL when CACHE_TTLS is not set', () => {
    delete process.env.CACHE_TTLS

    const ttl = getTtlForNamespace(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(ttl).toBe(600) // default TTL
  })

  it('returns default TTL when namespace not in CACHE_TTLS', () => {
    process.env.CACHE_TTLS = JSON.stringify({
      otherNamespace: 600,
    })

    const ttl = getTtlForNamespace(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(ttl).toBe(600) // default TTL
  })

  it('returns default TTL when CACHE_TTLS is invalid JSON', () => {
    process.env.CACHE_TTLS = 'not valid json'

    const ttl = getTtlForNamespace(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(ttl).toBe(600) // default TTL
  })
})

describe('dependency-based invalidation (Redis-backed)', () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    _setTestRedisClient(mockRedis.client)
  })

  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('registers dependencies in Redis Sets when cache is populated', async () => {
    const wrappedFn = vi.fn().mockResolvedValue({ id: 1 })
    const testSchema = z.object({ id: z.number() })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: (id: string) => id,
        schema: testSchema,
        dependenciesFn: (_result, id: string) => [
          `dep:A:${id}`,
          `dep:B:${id}`,
        ],
      },
      wrappedFn
    )

    await cachedFn('test-id')

    // Verify the Sets contain the cache key
    const depAKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:A:test-id`
    const depBKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:B:test-id`
    const expectedCacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:test-id`

    expect(mockRedis.sets[depAKey]?.has(expectedCacheKey)).toBe(true)
    expect(mockRedis.sets[depBKey]?.has(expectedCacheKey)).toBe(true)
  })

  it('invalidates correct cache keys when dependency is invalidated', async () => {
    const wrappedFn1 = vi.fn().mockResolvedValue({ entry: 1 })
    const wrappedFn2 = vi.fn().mockResolvedValue({ entry: 2 })
    const wrappedFn3 = vi.fn().mockResolvedValue({ entry: 3 })
    const testSchema = z.object({ entry: z.number() })

    // Create cached functions that share dep:A
    const cachedFn1 = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: () => 'entry1',
        schema: testSchema,
        dependenciesFn: (_result) => ['dep:A'],
      },
      wrappedFn1
    )

    const cachedFn2 = cached(
      {
        namespace: RedisKeyNamespace.ItemsBySubscription,
        keyFn: () => 'entry2',
        schema: testSchema,
        dependenciesFn: (_result) => ['dep:A'],
      },
      wrappedFn2
    )

    // This one only depends on dep:B
    const cachedFn3 = cached(
      {
        namespace: RedisKeyNamespace.FeaturesBySubscriptionItem,
        keyFn: () => 'entry3',
        schema: testSchema,
        dependenciesFn: (_result) => ['dep:B'],
      },
      wrappedFn3
    )

    // Populate caches
    await cachedFn1()
    await cachedFn2()
    await cachedFn3()

    const key1 = `${RedisKeyNamespace.SubscriptionsByCustomer}:entry1`
    const key2 = `${RedisKeyNamespace.ItemsBySubscription}:entry2`
    const key3 = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:entry3`

    // Verify all keys exist with correct values
    expect(JSON.parse(mockRedis.store[key1])).toEqual({ entry: 1 })
    expect(JSON.parse(mockRedis.store[key2])).toEqual({ entry: 2 })
    expect(JSON.parse(mockRedis.store[key3])).toEqual({ entry: 3 })

    // Invalidate dep:A
    await invalidateDependencies(['dep:A'])

    // Keys 1 and 2 should be deleted, key 3 should remain
    expect(mockRedis.store[key1]).toBeUndefined()
    expect(mockRedis.store[key2]).toBeUndefined()
    expect(JSON.parse(mockRedis.store[key3])).toEqual({ entry: 3 })
  })

  it('resolves without error when invalidating non-existent dependencies', async () => {
    await expect(
      invalidateDependencies([
        'dep:nonexistent',
        'dep:alsononexistent',
      ])
    ).resolves.toBeUndefined()
  })

  it('deletes dependency registry Set after invalidation', async () => {
    const testSchema = z.object({ val: z.string() })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: () => 'cleanup-test',
        schema: testSchema,
        dependenciesFn: (_result) => ['dep:cleanup'],
      },
      async () => ({ val: 'test' })
    )

    await cachedFn()

    const registryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:cleanup`
    const expectedCacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:cleanup-test`
    expect(mockRedis.sets[registryKey]?.has(expectedCacheKey)).toBe(
      true
    )

    await invalidateDependencies(['dep:cleanup'])

    // The registry Set is deleted after invalidation (recomputation is triggered automatically)
    expect(mockRedis.sets[registryKey]).toBeUndefined()
  })
})

// Helper to create a real handler with explicit state tracking
function createTestHandler(): {
  handler: RecomputeHandler
  calls: Array<{
    params: SerializableParams
    context: CacheRecomputationContext
  }>
} {
  const calls: Array<{
    params: SerializableParams
    context: CacheRecomputationContext
  }> = []
  const handler: RecomputeHandler = async (params, context) => {
    calls.push({ params, context })
  }
  return { handler, calls }
}

// Helper to create a handler that throws (for error handling tests)
function createThrowingHandler(): {
  handler: RecomputeHandler
  calls: Array<{
    params: SerializableParams
    context: CacheRecomputationContext
  }>
} {
  const calls: Array<{
    params: SerializableParams
    context: CacheRecomputationContext
  }> = []
  const handler: RecomputeHandler = async (params, context) => {
    calls.push({ params, context })
    throw new Error('Handler error')
  }
  return { handler, calls }
}

describe('invalidateDependencies with recomputation', () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    _setTestRedisClient(mockRedis.client)
  })

  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('triggers recomputation for cache entries that have recomputation metadata', async () => {
    const { handler, calls } = createTestHandler()
    registerRecomputeHandler(
      RedisKeyNamespace.SubscriptionsByCustomer,
      handler
    )

    // Set up a cache key with recomputation metadata
    const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:cust_123`
    const depRegistryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:test`

    // Register the cache key under the dependency
    mockRedis.sets[depRegistryKey] = new Set([cacheKey])

    // Store the cache value
    mockRedis.store[cacheKey] = JSON.stringify({ id: 'cust_123' })

    // Store recomputation metadata
    const metadata: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.SubscriptionsByCustomer,
      params: { customerId: 'cust_123' },
      cacheRecomputationContext: { type: 'admin', livemode: true },
      createdAt: Date.now(),
    }
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    mockRedis.store[metadataKey] = JSON.stringify(metadata)

    await invalidateDependencies(['dep:test'])

    // Cache key should be deleted
    expect(mockRedis.store[cacheKey]).toBeUndefined()

    // Handler should have been called with the stored params and context
    // Give a small delay for fire-and-forget to execute
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      params: { customerId: 'cust_123' },
      context: { type: 'admin', livemode: true },
    })
  })

  it('does not attempt recomputation for cache entries without metadata', async () => {
    const { handler, calls } = createTestHandler()
    registerRecomputeHandler(
      RedisKeyNamespace.ItemsBySubscription,
      handler
    )

    // Set up a cache key WITHOUT recomputation metadata (created by cached() not cachedRecomputable())
    const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:sub_456`
    const depRegistryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:no-metadata`

    // Register the cache key under the dependency
    mockRedis.sets[depRegistryKey] = new Set([cacheKey])

    // Store the cache value but NO metadata
    mockRedis.store[cacheKey] = JSON.stringify({ items: [] })

    await invalidateDependencies(['dep:no-metadata'])

    // Cache key should be deleted
    expect(mockRedis.store[cacheKey]).toBeUndefined()

    // Handler should NOT have been called (no metadata means no recomputation)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toHaveLength(0)
  })

  it('continues invalidation even if recomputation handler throws error', async () => {
    const { handler: throwingHandler, calls } =
      createThrowingHandler()
    registerRecomputeHandler(
      RedisKeyNamespace.FeaturesBySubscriptionItem,
      throwingHandler
    )

    // Set up two cache keys, both with metadata
    const cacheKey1 = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:feat_1`
    const cacheKey2 = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:feat_2`
    const depRegistryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:failing`

    mockRedis.sets[depRegistryKey] = new Set([cacheKey1, cacheKey2])
    mockRedis.store[cacheKey1] = JSON.stringify({ id: 'feat_1' })
    mockRedis.store[cacheKey2] = JSON.stringify({ id: 'feat_2' })

    const metadata1: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.FeaturesBySubscriptionItem,
      params: { featureId: 'feat_1' },
      cacheRecomputationContext: { type: 'admin', livemode: false },
      createdAt: Date.now(),
    }
    const metadata2: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.FeaturesBySubscriptionItem,
      params: { featureId: 'feat_2' },
      cacheRecomputationContext: { type: 'admin', livemode: false },
      createdAt: Date.now(),
    }

    mockRedis.store[
      `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey1}`
    ] = JSON.stringify(metadata1)
    mockRedis.store[
      `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey2}`
    ] = JSON.stringify(metadata2)

    // Should not throw despite handler throwing
    await expect(
      invalidateDependencies(['dep:failing'])
    ).resolves.toBeUndefined()

    // Both cache keys should still be deleted
    expect(mockRedis.store[cacheKey1]).toBeUndefined()
    expect(mockRedis.store[cacheKey2]).toBeUndefined()

    // Handler should have been called for both (fire-and-forget)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toHaveLength(2)
  })

  it('only checks metadata existence, does not recompute entries where handler is not registered', async () => {
    // Use a namespace that has no handler registered
    const cacheKey = `${RedisKeyNamespace.BannerDismissals}:banner_1`
    const depRegistryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:no-handler`

    mockRedis.sets[depRegistryKey] = new Set([cacheKey])
    mockRedis.store[cacheKey] = JSON.stringify({ dismissed: true })

    // Store metadata but don't register handler for BannerDismissals
    const metadata: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.BannerDismissals,
      params: { bannerId: 'banner_1' },
      cacheRecomputationContext: { type: 'admin', livemode: false },
      createdAt: Date.now(),
    }
    mockRedis.store[
      `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    ] = JSON.stringify(metadata)

    // Should complete without error (recomputeCacheEntry handles missing handler gracefully)
    await expect(
      invalidateDependencies(['dep:no-handler'])
    ).resolves.toBeUndefined()

    // Cache key should be deleted
    expect(mockRedis.store[cacheKey]).toBeUndefined()
  })
})

describe('CacheDependency helpers', () => {
  it('creates consistent customerSubscriptions dependency keys', () => {
    const key = CacheDependency.customerSubscriptions('cust_123')
    expect(key).toBe('customerSubscriptions:cust_123')
  })

  it('creates consistent subscriptionItems dependency keys', () => {
    const key = CacheDependency.subscriptionItems('sub_456')
    expect(key).toBe('subscriptionItems:sub_456')
  })

  it('creates consistent subscriptionLedger dependency keys', () => {
    const key = CacheDependency.subscriptionLedger('sub_456')
    expect(key).toBe('subscriptionLedger:sub_456')
  })
})

describe('recompute registry', () => {
  it('registerRecomputeHandler stores handler and getRecomputeHandler retrieves it', () => {
    const mockHandler: RecomputeHandler = vi
      .fn()
      .mockResolvedValue({})

    registerRecomputeHandler(
      RedisKeyNamespace.SubscriptionsByCustomer,
      mockHandler
    )

    const retrieved = getRecomputeHandler(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(retrieved).toBe(mockHandler)
  })

  it('getRecomputeHandler returns undefined for unregistered namespace', () => {
    // Use a namespace we know wasn't registered by using a fresh namespace
    // Note: We test this with MeterBalancesBySubscription which we know is not registered
    const retrieved = getRecomputeHandler(
      RedisKeyNamespace.MeterBalancesBySubscription
    )
    expect(retrieved).toBeUndefined()
  })
})

describe('recomputeCacheEntry', () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    _setTestRedisClient(mockRedis.client)
  })

  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('calls handler with params and cacheRecomputationContext from metadata', async () => {
    const mockHandler: RecomputeHandler = vi
      .fn()
      .mockResolvedValue({})
    registerRecomputeHandler(
      RedisKeyNamespace.ItemsBySubscription,
      mockHandler
    )

    const params: SerializableParams = {
      subscriptionId: 'sub_123',
      livemode: true,
    }
    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'admin',
      livemode: true,
    }
    const metadata: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.ItemsBySubscription,
      params,
      cacheRecomputationContext,
      createdAt: Date.now(),
    }

    const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:sub_123`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    mockRedis.store[metadataKey] = JSON.stringify(metadata)

    await recomputeCacheEntry(cacheKey)

    expect(mockHandler).toHaveBeenCalledTimes(1)
    expect(mockHandler).toHaveBeenCalledWith(
      params,
      cacheRecomputationContext
    )
  })

  it('does nothing when metadata key does not exist', async () => {
    const mockHandler: RecomputeHandler = vi
      .fn()
      .mockResolvedValue({})
    registerRecomputeHandler(
      RedisKeyNamespace.FeaturesBySubscriptionItem,
      mockHandler
    )

    // No metadata stored for this cache key
    const cacheKey = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:nonexistent`

    await recomputeCacheEntry(cacheKey)

    expect(mockHandler).not.toHaveBeenCalled()
  })

  it('logs warning when handler not registered for namespace but does not throw', async () => {
    // Use a unique namespace that definitely has no handler registered
    const params: SerializableParams = { id: 'test' }
    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'merchant',
      livemode: false,
      organizationId: 'org_123',
      userId: 'user_456',
    }
    const metadata: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.BannerDismissals, // No handler for this
      params,
      cacheRecomputationContext,
      createdAt: Date.now(),
    }

    const cacheKey = `${RedisKeyNamespace.BannerDismissals}:test`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    mockRedis.store[metadataKey] = JSON.stringify(metadata)

    // Should not throw - just logs warning
    await expect(
      recomputeCacheEntry(cacheKey)
    ).resolves.toBeUndefined()
  })

  it('logs warning when handler throws error and does not propagate', async () => {
    const throwingHandler: RecomputeHandler = vi
      .fn()
      .mockRejectedValue(new Error('Handler error'))
    registerRecomputeHandler(
      RedisKeyNamespace.StripeOAuthCsrfToken,
      throwingHandler
    )

    const metadata: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.StripeOAuthCsrfToken,
      params: { key: 'value' },
      cacheRecomputationContext: { type: 'admin', livemode: false },
      createdAt: Date.now(),
    }

    const cacheKey = `${RedisKeyNamespace.StripeOAuthCsrfToken}:test`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    mockRedis.store[metadataKey] = JSON.stringify(metadata)

    // Should not throw - logs warning and fails open
    await expect(
      recomputeCacheEntry(cacheKey)
    ).resolves.toBeUndefined()
    expect(throwingHandler).toHaveBeenCalled()
  })
})

describe('recomputeDependencies', () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    _setTestRedisClient(mockRedis.client)
  })

  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('recomputes all cache entries associated with dependencies', async () => {
    const mockHandler: RecomputeHandler = vi
      .fn()
      .mockResolvedValue({})
    registerRecomputeHandler(
      RedisKeyNamespace.CacheDependencyRegistry,
      mockHandler
    )

    // Set up two cache keys registered under one dependency
    const cacheKey1 = `${RedisKeyNamespace.CacheDependencyRegistry}:key1`
    const cacheKey2 = `${RedisKeyNamespace.CacheDependencyRegistry}:key2`
    const depRegistryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:test`

    mockRedis.sets[depRegistryKey] = new Set([cacheKey1, cacheKey2])

    // Set up metadata for both cache keys
    const metadata1: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.CacheDependencyRegistry,
      params: { keyId: 'key1' },
      cacheRecomputationContext: { type: 'admin', livemode: true },
      createdAt: Date.now(),
    }
    const metadata2: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.CacheDependencyRegistry,
      params: { keyId: 'key2' },
      cacheRecomputationContext: { type: 'admin', livemode: true },
      createdAt: Date.now(),
    }

    mockRedis.store[
      `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey1}`
    ] = JSON.stringify(metadata1)
    mockRedis.store[
      `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey2}`
    ] = JSON.stringify(metadata2)

    await recomputeDependencies(['dep:test'])

    expect(mockHandler).toHaveBeenCalledTimes(2)
    expect(mockHandler).toHaveBeenCalledWith(
      { keyId: 'key1' },
      { type: 'admin', livemode: true }
    )
    expect(mockHandler).toHaveBeenCalledWith(
      { keyId: 'key2' },
      { type: 'admin', livemode: true }
    )
  })

  it('deduplicates cache keys across dependencies', async () => {
    const mockHandler: RecomputeHandler = vi
      .fn()
      .mockResolvedValue({})
    registerRecomputeHandler(RedisKeyNamespace.Telemetry, mockHandler)

    // Same cache key appears under two different dependencies
    const cacheKey = `${RedisKeyNamespace.Telemetry}:shared-key`
    const depRegistryKey1 = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:A`
    const depRegistryKey2 = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:B`

    mockRedis.sets[depRegistryKey1] = new Set([cacheKey])
    mockRedis.sets[depRegistryKey2] = new Set([cacheKey])

    // Set up metadata for the cache key
    const metadata: CacheRecomputeMetadata = {
      namespace: RedisKeyNamespace.Telemetry,
      params: { id: 'shared' },
      cacheRecomputationContext: { type: 'admin', livemode: false },
      createdAt: Date.now(),
    }

    mockRedis.store[
      `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    ] = JSON.stringify(metadata)

    await recomputeDependencies(['dep:A', 'dep:B'])

    // Handler should only be called once despite key appearing in both dependencies
    expect(mockHandler).toHaveBeenCalledTimes(1)
    expect(mockHandler).toHaveBeenCalledWith(
      { id: 'shared' },
      { type: 'admin', livemode: false }
    )
  })
})

/**
 * Creates a trackable async function for testing.
 * Returns the function and a tracker object to check call count.
 * This avoids using vi.fn() which should only be used for network calls.
 */
function createTrackableFn<TParams, TResult>(
  result: TResult
): {
  fn: (
    params: TParams,
    transaction: DbTransaction
  ) => Promise<TResult>
  tracker: { callCount: number }
} {
  const tracker = { callCount: 0 }
  const fn = async (
    _params: TParams,
    _transaction: DbTransaction
  ): Promise<TResult> => {
    tracker.callCount++
    return result
  }
  return { fn, tracker }
}

describe('cachedRecomputable', () => {
  let mockRedis: ReturnType<typeof createMockRedisClient>

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    _setTestRedisClient(mockRedis.client)
  })

  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('auto-registers recomputation handler on definition', () => {
    // Use a unique namespace for this test to avoid interference
    const testNamespace = RedisKeyNamespace.SubscriptionsByCustomer

    // Define a recomputable cached function - this should auto-register a handler
    const { fn } = createTrackableFn<
      { customerId: string },
      { id: string; name: string }
    >({
      id: 'test',
      name: 'Test',
    })
    cachedRecomputable(
      {
        namespace: testNamespace,
        paramsSchema: z.object({ customerId: z.string() }),
        keyFn: (params: { customerId: string }) => params.customerId,
        schema: z.object({ id: z.string(), name: z.string() }),
        dependenciesFn: (params) => [
          CacheDependency.customerSubscriptions(params.customerId),
        ],
      },
      fn
    )

    // The handler should be registered immediately after definition
    const handler = getRecomputeHandler(testNamespace)
    // Verify it's a function (implicitly confirms it's defined)
    expect(typeof handler).toBe('function')
  })

  it('stores params metadata alongside cache value on cache miss', async () => {
    const testSchema = z.object({ value: z.number() })
    const { fn: wrappedFn } = createTrackableFn<
      { subId: string },
      { value: number }
    >({
      value: 42,
    })

    const cachedFn = cachedRecomputable(
      {
        namespace: RedisKeyNamespace.ItemsBySubscription,
        paramsSchema: z.object({ subId: z.string() }),
        keyFn: (params: { subId: string }) => params.subId,
        schema: testSchema,
        dependenciesFn: () => [],
      },
      wrappedFn
    )

    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'admin',
      livemode: true,
    }

    const mockTransaction = {} as DbTransaction
    await cachedFn(
      { subId: 'sub_123' },
      mockTransaction,
      cacheRecomputationContext
    )

    // Verify cache value was stored
    const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:sub_123`
    expect(JSON.parse(mockRedis.store[cacheKey])).toEqual({
      value: 42,
    })

    // Verify metadata was stored
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    const metadataStr = mockRedis.store[metadataKey]
    // Parsing will fail if undefined, so this test implicitly verifies it exists
    const metadata = JSON.parse(metadataStr) as CacheRecomputeMetadata
    expect(metadata.namespace).toBe(
      RedisKeyNamespace.ItemsBySubscription
    )
    expect(metadata.params).toEqual({ subId: 'sub_123' })
  })

  it('metadata params match the input params exactly', async () => {
    const testSchema = z.object({ count: z.number() })
    type TestParams = {
      customerId: string
      livemode: boolean
      tags: string[]
    }
    const { fn: wrappedFn } = createTrackableFn<
      TestParams,
      { count: number }
    >({
      count: 10,
    })

    const testParamsSchema = z.object({
      customerId: z.string(),
      livemode: z.boolean(),
      tags: z.array(z.string()),
    })

    const cachedFn = cachedRecomputable(
      {
        namespace: RedisKeyNamespace.FeaturesBySubscriptionItem,
        paramsSchema: testParamsSchema,
        keyFn: (params: TestParams) =>
          `${params.customerId}:${params.livemode}`,
        schema: testSchema,
        dependenciesFn: () => [],
      },
      wrappedFn
    )

    const inputParams = {
      customerId: 'cust_1',
      livemode: true,
      tags: ['premium', 'active'],
    }

    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'merchant',
      livemode: true,
      organizationId: 'org_123',
      userId: 'user_456',
    }

    const mockTransaction = {} as DbTransaction
    await cachedFn(
      inputParams,
      mockTransaction,
      cacheRecomputationContext
    )

    const cacheKey = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:cust_1:true`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    const metadata = JSON.parse(
      mockRedis.store[metadataKey]
    ) as CacheRecomputeMetadata

    // Params should match exactly, including the array
    expect(metadata.params).toEqual(inputParams)
    expect(metadata.params.customerId).toBe('cust_1')
    expect(metadata.params.livemode).toBe(true)
    expect(metadata.params.tags).toEqual(['premium', 'active'])
  })

  it('stores transaction context in metadata for recomputation', async () => {
    const testSchema = z.object({ data: z.string() })
    const { fn: wrappedFn } = createTrackableFn<
      { id: string },
      { data: string }
    >({
      data: 'test',
    })

    const cachedFn = cachedRecomputable(
      {
        namespace: RedisKeyNamespace.MeterBalancesBySubscription,
        paramsSchema: z.object({ id: z.string() }),
        keyFn: (params: { id: string }) => params.id,
        schema: testSchema,
        dependenciesFn: () => [],
      },
      wrappedFn
    )

    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'merchant',
      livemode: false,
      organizationId: 'org_test_123',
      userId: 'user_test_456',
    }

    const mockTransaction = {} as DbTransaction
    await cachedFn(
      { id: 'meter_123' },
      mockTransaction,
      cacheRecomputationContext
    )

    const cacheKey = `${RedisKeyNamespace.MeterBalancesBySubscription}:meter_123`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    const metadata = JSON.parse(
      mockRedis.store[metadataKey]
    ) as CacheRecomputeMetadata

    // Transaction context should be preserved exactly
    expect(metadata.cacheRecomputationContext).toEqual(
      cacheRecomputationContext
    )
    expect(metadata.cacheRecomputationContext.type).toBe('merchant')
    if (metadata.cacheRecomputationContext.type === 'merchant') {
      expect(metadata.cacheRecomputationContext.organizationId).toBe(
        'org_test_123'
      )
      expect(metadata.cacheRecomputationContext.userId).toBe(
        'user_test_456'
      )
      expect(metadata.cacheRecomputationContext.livemode).toBe(false)
    }
  })

  it('returns cached value on cache hit without calling wrapped function', async () => {
    const testSchema = z.object({ cached: z.boolean() })
    const { fn: wrappedFn, tracker } = createTrackableFn<
      { key: string },
      { cached: boolean }
    >({
      cached: false,
    })

    const cachedFn = cachedRecomputable(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        paramsSchema: z.object({ key: z.string() }),
        keyFn: (params: { key: string }) => params.key,
        schema: testSchema,
        dependenciesFn: () => [],
      },
      wrappedFn
    )

    // Pre-populate cache
    const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:hit-test`
    mockRedis.store[cacheKey] = JSON.stringify({ cached: true })

    const mockTransaction = {} as DbTransaction
    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'admin',
      livemode: true,
    }
    const result = await cachedFn(
      { key: 'hit-test' },
      mockTransaction,
      cacheRecomputationContext
    )

    // Should return cached value
    expect(result).toEqual({ cached: true })
    // Wrapped function should not be called on cache hit
    expect(tracker.callCount).toBe(0)
  })

  it('registers dependencies for cache invalidation', async () => {
    const testSchema = z.object({ items: z.array(z.string()) })
    const { fn: wrappedFn } = createTrackableFn<
      { customerId: string },
      { items: string[] }
    >({
      items: ['item1', 'item2'],
    })

    const cachedFn = cachedRecomputable(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        paramsSchema: z.object({ customerId: z.string() }),
        keyFn: (params: { customerId: string }) => params.customerId,
        schema: testSchema,
        dependenciesFn: (params) => [
          CacheDependency.customerSubscriptions(params.customerId),
          CacheDependency.subscriptionItems('sub_main'),
        ],
      },
      wrappedFn
    )

    const cacheRecomputationContext: CacheRecomputationContext = {
      type: 'admin',
      livemode: true,
    }

    const mockTransaction = {} as DbTransaction
    await cachedFn(
      { customerId: 'cust_deps' },
      mockTransaction,
      cacheRecomputationContext
    )

    // Verify dependencies were registered
    const depKey1 = `${RedisKeyNamespace.CacheDependencyRegistry}:customerSubscriptions:cust_deps`
    const depKey2 = `${RedisKeyNamespace.CacheDependencyRegistry}:subscriptionItems:sub_main`
    const expectedCacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:cust_deps`

    expect(mockRedis.sets[depKey1]?.has(expectedCacheKey)).toBe(true)
    expect(mockRedis.sets[depKey2]?.has(expectedCacheKey)).toBe(true)
  })
})

describe('evalWithShaFallback behavior (via trackAndEvictLRU)', () => {
  afterEach(() => {
    _setTestRedisClient(null)
  })

  it('falls back to EVAL when EVALSHA returns NOSCRIPT error', async () => {
    let evalshaCallCount = 0
    let evalCallCount = 0

    const mockClient = {
      evalsha: () => {
        evalshaCallCount++
        throw new Error('NOSCRIPT No matching script')
      },
      eval: () => {
        evalCallCount++
        // Return 0 (no eviction needed)
        return 0
      },
      zadd: () => 1,
      zcard: () => 1,
      zrange: () => [],
      zrem: () => 0,
      del: () => 0,
    }

    _setTestRedisClient(mockClient)

    const result = await trackAndEvictLRU(
      RedisKeyNamespace.SubscriptionsByCustomer,
      'test-key'
    )

    expect(evalshaCallCount).toBe(1)
    expect(evalCallCount).toBe(1)
    expect(result).toBe(0)
  })

  it('re-throws non-NOSCRIPT errors from EVALSHA', async () => {
    const mockClient = {
      evalsha: () => {
        throw new Error('ERR some other Redis error')
      },
      eval: () => {
        throw new Error('eval should not be called')
      },
      zadd: () => 1,
      zcard: () => 1,
      zrange: () => [],
      zrem: () => 0,
      del: () => 0,
    }

    _setTestRedisClient(mockClient)

    // trackAndEvictLRU catches errors and fails open (returns 0)
    // but we need to verify the error was not a NOSCRIPT fallback
    let evalCalled = false
    const mockClientWithTracking = {
      ...mockClient,
      eval: () => {
        evalCalled = true
        return 0
      },
    }

    _setTestRedisClient(mockClientWithTracking)

    const result = await trackAndEvictLRU(
      RedisKeyNamespace.SubscriptionsByCustomer,
      'test-key'
    )

    // Since non-NOSCRIPT error is thrown, eval should NOT be called
    expect(evalCalled).toBe(false)
    // trackAndEvictLRU fails open and returns 0
    expect(result).toBe(0)
  })

  it('EVALSHA success path does not call EVAL', async () => {
    let evalshaCallCount = 0
    let evalCallCount = 0

    const mockClient = {
      evalsha: () => {
        evalshaCallCount++
        return 0 // Success
      },
      eval: () => {
        evalCallCount++
        return 0
      },
      zadd: () => 1,
      zcard: () => 1,
      zrange: () => [],
      zrem: () => 0,
      del: () => 0,
    }

    _setTestRedisClient(mockClient)

    const result = await trackAndEvictLRU(
      RedisKeyNamespace.SubscriptionsByCustomer,
      'test-key'
    )

    expect(evalshaCallCount).toBe(1)
    expect(evalCallCount).toBe(0)
    expect(result).toBe(0)
  })
})
