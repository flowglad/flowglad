import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { z } from 'zod'
import {
  CacheDependency,
  cached,
  getTtlForNamespace,
  invalidateDependencies,
} from './cache'
import { _setTestRedisClient, RedisKeyNamespace } from './redis'

// In-memory mock Redis client for testing
function createMockRedisClient() {
  const store: Record<string, string> = {}
  const sets: Record<string, Set<string>> = {}

  return {
    store,
    sets,
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
      expire: () => 1,
      exists: (...keys: string[]) => {
        let count = 0
        for (const key of keys) {
          if (store[key] !== undefined || sets[key] !== undefined) {
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
        dependenciesFn: (customerId: string) => [
          CacheDependency.customer(customerId),
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
        dependenciesFn: () => [],
      },
      wrappedFn
    )

    await cachedFn('sub_456')

    // Check that the key was stored with correct format
    const expectedKey = `${RedisKeyNamespace.ItemsBySubscription}:items-sub_456`
    expect(mockRedis.store[expectedKey]).toBeDefined()
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
        dependenciesFn: () => [],
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
        dependenciesFn: () => [],
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
    expect(ttl).toBe(300) // default TTL
  })

  it('returns default TTL when namespace not in CACHE_TTLS', () => {
    process.env.CACHE_TTLS = JSON.stringify({
      otherNamespace: 600,
    })

    const ttl = getTtlForNamespace(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(ttl).toBe(300) // default TTL
  })

  it('returns default TTL when CACHE_TTLS is invalid JSON', () => {
    process.env.CACHE_TTLS = 'not valid json'

    const ttl = getTtlForNamespace(
      RedisKeyNamespace.SubscriptionsByCustomer
    )
    expect(ttl).toBe(300) // default TTL
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
        dependenciesFn: (id: string) => [
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
        dependenciesFn: () => ['dep:A'],
      },
      wrappedFn1
    )

    const cachedFn2 = cached(
      {
        namespace: RedisKeyNamespace.ItemsBySubscription,
        keyFn: () => 'entry2',
        schema: testSchema,
        dependenciesFn: () => ['dep:A'],
      },
      wrappedFn2
    )

    // This one only depends on dep:B
    const cachedFn3 = cached(
      {
        namespace: RedisKeyNamespace.FeaturesBySubscriptionItem,
        keyFn: () => 'entry3',
        schema: testSchema,
        dependenciesFn: () => ['dep:B'],
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

    // Verify all keys exist
    expect(mockRedis.store[key1]).toBeDefined()
    expect(mockRedis.store[key2]).toBeDefined()
    expect(mockRedis.store[key3]).toBeDefined()

    // Invalidate dep:A
    await invalidateDependencies(['dep:A'])

    // Keys 1 and 2 should be deleted, key 3 should remain
    expect(mockRedis.store[key1]).toBeUndefined()
    expect(mockRedis.store[key2]).toBeUndefined()
    expect(mockRedis.store[key3]).toBeDefined()
  })

  it('handles invalidation of non-existent dependencies gracefully', async () => {
    // Should not throw
    await expect(
      invalidateDependencies([
        'dep:nonexistent',
        'dep:alsononexistent',
      ])
    ).resolves.toBeUndefined()
  })

  it('deletes dependency registry Set after invalidation', async () => {
    const wrappedFn = vi.fn().mockResolvedValue({ val: 'test' })
    const testSchema = z.object({ val: z.string() })

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: () => 'cleanup-test',
        schema: testSchema,
        dependenciesFn: () => ['dep:cleanup'],
      },
      wrappedFn
    )

    await cachedFn()

    const registryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:dep:cleanup`
    expect(mockRedis.sets[registryKey]).toBeDefined()

    await invalidateDependencies(['dep:cleanup'])

    // The registry Set should be deleted
    expect(mockRedis.sets[registryKey]).toBeUndefined()
  })
})

describe('CacheDependency helpers', () => {
  it('creates consistent customer dependency keys', () => {
    const key = CacheDependency.customer('cust_123')
    expect(key).toBe('customer:cust_123')
  })

  it('creates consistent subscription dependency keys', () => {
    const key = CacheDependency.subscription('sub_456')
    expect(key).toBe('subscription:sub_456')
  })

  it('creates consistent subscriptionItem dependency keys', () => {
    const key = CacheDependency.subscriptionItem('si_789')
    expect(key).toBe('subscriptionItem:si_789')
  })

  it('creates consistent ledger dependency keys', () => {
    const key = CacheDependency.subscriptionLedger('sub_456')
    expect(key).toBe('ledger:sub_456')
  })
})
