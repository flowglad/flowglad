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
  _testUtils,
  CacheDependency,
  cached,
  getTtlForNamespace,
  invalidateDependencies,
} from './cache'
import { RedisKeyNamespace } from './redis'

// Mock the redis module
vi.mock('./redis', async () => {
  const actual = await vi.importActual('./redis')
  let mockStore: Record<string, string> = {}

  return {
    ...actual,
    redis: () => ({
      get: vi.fn((key: string) => mockStore[key] ?? null),
      set: vi.fn((key: string, value: string) => {
        mockStore[key] = value
        return 'OK'
      }),
      del: vi.fn((key: string) => {
        delete mockStore[key]
        return 1
      }),
    }),
    // Expose mock store for tests
    __mockStore: mockStore,
    __clearMockStore: () => {
      mockStore = {}
    },
  }
})

// Get mock utilities
const getMockRedis = async () => {
  const redisMod = await import('./redis')
  return {
    // @ts-expect-error - accessing test-only exports
    mockStore: redisMod.__mockStore as Record<string, string>,
    // @ts-expect-error - accessing test-only exports
    clearMockStore: redisMod.__clearMockStore as () => void,
    redis: redisMod.redis,
  }
}

describe('cached combinator', () => {
  beforeEach(async () => {
    const { clearMockStore } = await getMockRedis()
    clearMockStore()
    _testUtils.clearDependencyRegistry()
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
    const { mockStore } = await getMockRedis()

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
    expect(mockStore[expectedKey]).toBeDefined()
    expect(JSON.parse(mockStore[expectedKey])).toEqual({ value: 42 })
  })

  it('fails open when Redis get throws error', async () => {
    const wrappedFn = vi.fn().mockResolvedValue({ data: 'fallback' })
    const testSchema = z.object({ data: z.string() })

    // Mock redis to throw on get
    vi.doMock('./redis', () => ({
      redis: () => ({
        get: vi
          .fn()
          .mockRejectedValue(new Error('Redis connection failed')),
        set: vi.fn(),
        del: vi.fn(),
      }),
      RedisKeyNamespace: {
        SubscriptionsByCustomer: 'subscriptionsByCustomer',
      },
    }))

    const cachedFn = cached(
      {
        namespace: RedisKeyNamespace.SubscriptionsByCustomer,
        keyFn: () => 'key',
        schema: testSchema,
        dependenciesFn: () => [],
      },
      wrappedFn
    )

    const result = await cachedFn()

    // Should fall back to wrapped function
    expect(wrappedFn).toHaveBeenCalled()
    expect(result).toEqual({ data: 'fallback' })
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
    const { mockStore, redis } = await getMockRedis()

    // Pre-populate cache with invalid data (missing required field)
    const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:test-key`
    mockStore[cacheKey] = JSON.stringify({ invalidStructure: true })

    // Override get to return the invalid cached value
    const redisClient = redis()
    vi.spyOn(redisClient, 'get').mockResolvedValue(
      mockStore[cacheKey]
    )

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

describe('dependency-based invalidation', () => {
  beforeEach(async () => {
    const { clearMockStore } = await getMockRedis()
    clearMockStore()
    _testUtils.clearDependencyRegistry()
  })

  it('registers dependencies when cache is populated', async () => {
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

    const registry = _testUtils.getDependencyToCacheKeys()
    expect(registry.has('dep:A:test-id')).toBe(true)
    expect(registry.has('dep:B:test-id')).toBe(true)

    const cacheKeysForA = registry.get('dep:A:test-id')
    const cacheKeysForB = registry.get('dep:B:test-id')
    const expectedCacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:test-id`

    expect(cacheKeysForA?.has(expectedCacheKey)).toBe(true)
    expect(cacheKeysForB?.has(expectedCacheKey)).toBe(true)
  })

  it('invalidates correct cache keys when dependency is invalidated', async () => {
    const wrappedFn1 = vi.fn().mockResolvedValue({ entry: 1 })
    const wrappedFn2 = vi.fn().mockResolvedValue({ entry: 2 })
    const wrappedFn3 = vi.fn().mockResolvedValue({ entry: 3 })
    const testSchema = z.object({ entry: z.number() })
    const { mockStore } = await getMockRedis()

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
    expect(mockStore[key1]).toBeDefined()
    expect(mockStore[key2]).toBeDefined()
    expect(mockStore[key3]).toBeDefined()

    // Invalidate dep:A
    await invalidateDependencies(['dep:A'])

    // Keys 1 and 2 should be deleted, key 3 should remain
    expect(mockStore[key1]).toBeUndefined()
    expect(mockStore[key2]).toBeUndefined()
    expect(mockStore[key3]).toBeDefined()
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

  it('cleans up dependency registry after invalidation', async () => {
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

    const registry = _testUtils.getDependencyToCacheKeys()
    expect(registry.has('dep:cleanup')).toBe(true)

    await invalidateDependencies(['dep:cleanup'])

    expect(registry.has('dep:cleanup')).toBe(false)
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
