import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { selectSubscriptionsByCustomerId } from '@/db/tableMethods/subscriptionMethods'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  generateTestKeyPrefix,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import { IntervalUnit, PriceType, SubscriptionStatus } from '@/types'
import {
  CacheDependency,
  cached,
  cachedBulkLookup,
  invalidateDependencies,
} from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'

/**
 * Integration tests for the cache infrastructure.
 *
 * These tests make real calls to Redis (Upstash) to verify:
 * 1. The cached combinator correctly stores and retrieves data
 * 2. Dependency registration works correctly with Redis Sets
 * 3. invalidateDependencies correctly removes cache entries
 *
 * These tests require UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * environment variables to be set.
 */

// Test-specific namespace to avoid conflicts with production data
const TEST_NAMESPACE = RedisKeyNamespace.SubscriptionsByCustomer

describeIfRedisKey('Cache Integration Tests', () => {
  let testKeyPrefix: string
  let keysToCleanup: string[] = []

  beforeEach(() => {
    testKeyPrefix = generateTestKeyPrefix()
    keysToCleanup = []
  })

  afterEach(async () => {
    const client = getRedisTestClient()
    await cleanupRedisTestKeys(client, keysToCleanup)
  })

  it('cached combinator stores result in Redis and returns it on subsequent calls', async () => {
    const client = getRedisTestClient()
    const testKey = `${testKeyPrefix}_customer_123`
    const fullCacheKey = `${TEST_NAMESPACE}:${testKey}`
    keysToCleanup.push(fullCacheKey)

    let callCount = 0
    const mockFn = async (customerId: string) => {
      callCount++
      return { id: customerId, name: 'Test Customer' }
    }

    const cachedFn = cached(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (customerId: string) =>
          `${testKeyPrefix}_${customerId}`,
        schema: z.object({
          id: z.string(),
          name: z.string(),
        }),
        dependenciesFn: () => [],
      },
      mockFn
    )

    // First call - should execute the function and cache the result
    const result1 = await cachedFn('customer_123')
    expect(result1).toEqual({
      id: 'customer_123',
      name: 'Test Customer',
    })
    expect(callCount).toBe(1)

    // Verify the value is stored in Redis
    const storedValue = await client.get(fullCacheKey)
    expect(typeof storedValue).toBe('object')
    const parsedStoredValue =
      typeof storedValue === 'string'
        ? JSON.parse(storedValue)
        : storedValue
    expect(parsedStoredValue).toEqual({
      id: 'customer_123',
      name: 'Test Customer',
    })

    // Second call - should return cached result without executing the function
    const result2 = await cachedFn('customer_123')
    expect(result2).toEqual({
      id: 'customer_123',
      name: 'Test Customer',
    })
    expect(callCount).toBe(1) // Function should not have been called again
  })

  it('cached combinator registers dependencies in Redis Sets', async () => {
    const client = getRedisTestClient()
    const testKey = `${testKeyPrefix}_sub_456`
    const fullCacheKey = `${TEST_NAMESPACE}:${testKey}`
    const dependencyKey = `${testKeyPrefix}_dep_customer_789`
    const registryKey = `cacheDeps:${dependencyKey}`

    keysToCleanup.push(fullCacheKey, registryKey)

    const mockFn = async (subscriptionId: string) => {
      return { id: subscriptionId, status: 'active' }
    }

    const cachedFn = cached(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (subId: string) => `${testKeyPrefix}_${subId}`,
        schema: z.object({
          id: z.string(),
          status: z.string(),
        }),
        dependenciesFn: () => [dependencyKey],
      },
      mockFn
    )

    // Call the cached function to trigger caching and dependency registration
    await cachedFn('sub_456')

    // Verify the dependency registry contains our cache key
    const registeredKeys = await client.smembers(registryKey)
    expect(registeredKeys).toContain(fullCacheKey)
  })

  it('invalidateDependencies removes all cache entries associated with a dependency', async () => {
    const client = getRedisTestClient()

    // Set up multiple cache entries that depend on the same dependency
    const dependencyKey = `${testKeyPrefix}_customer_invalidate_test`
    const registryKey = `cacheDeps:${dependencyKey}`

    const cacheKey1 = `${TEST_NAMESPACE}:${testKeyPrefix}_cache_entry_1`
    const cacheKey2 = `${TEST_NAMESPACE}:${testKeyPrefix}_cache_entry_2`

    keysToCleanup.push(cacheKey1, cacheKey2, registryKey)

    // Manually set up the cache entries and registry (simulating what cached() does)
    await client.set(cacheKey1, JSON.stringify({ data: 'entry1' }))
    await client.set(cacheKey2, JSON.stringify({ data: 'entry2' }))
    await client.sadd(registryKey, cacheKey1, cacheKey2)

    // Verify setup
    const beforeEntry1 = await client.get(cacheKey1)
    const beforeEntry2 = await client.get(cacheKey2)
    expect(beforeEntry1).toMatchObject({})
    expect(beforeEntry2).toMatchObject({})

    // Invalidate the dependency
    await invalidateDependencies([dependencyKey])

    // Verify all cache entries are deleted
    const afterEntry1 = await client.get(cacheKey1)
    const afterEntry2 = await client.get(cacheKey2)
    expect(afterEntry1).toBeNull()
    expect(afterEntry2).toBeNull()

    // Verify the registry is also deleted
    const registryExists = await client.exists(registryKey)
    expect(registryExists).toBe(0)
  })

  it('invalidateDependencies deletes cache entries for all provided dependency keys when given multiple dependencies', async () => {
    const client = getRedisTestClient()

    // Set up cache entries for two different dependencies
    const dep1Key = `${testKeyPrefix}_customer_multi_1`
    const dep2Key = `${testKeyPrefix}_subscription_multi_1`
    const registry1Key = `cacheDeps:${dep1Key}`
    const registry2Key = `cacheDeps:${dep2Key}`

    const cacheKey1 = `${TEST_NAMESPACE}:${testKeyPrefix}_entry_for_dep1`
    const cacheKey2 = `${TEST_NAMESPACE}:${testKeyPrefix}_entry_for_dep2`

    keysToCleanup.push(
      cacheKey1,
      cacheKey2,
      registry1Key,
      registry2Key
    )

    // Set up the cache entries and registries
    await client.set(cacheKey1, JSON.stringify({ data: 'for_dep1' }))
    await client.set(cacheKey2, JSON.stringify({ data: 'for_dep2' }))
    await client.sadd(registry1Key, cacheKey1)
    await client.sadd(registry2Key, cacheKey2)

    // Invalidate both dependencies at once
    await invalidateDependencies([dep1Key, dep2Key])

    // Verify both cache entries are deleted
    const afterEntry1 = await client.get(cacheKey1)
    const afterEntry2 = await client.get(cacheKey2)
    expect(afterEntry1).toBeNull()
    expect(afterEntry2).toBeNull()
  })

  it('CacheDependency helpers produce correctly formatted dependency keys', () => {
    // Verify the helper functions produce the expected key format
    expect(CacheDependency.customerSubscriptions('cust_123')).toBe(
      'customerSubscriptions:cust_123'
    )
    expect(CacheDependency.subscriptionItems('sub_456')).toBe(
      'subscriptionItems:sub_456'
    )
    expect(CacheDependency.subscriptionItemFeatures('si_789')).toBe(
      'subscriptionItemFeatures:si_789'
    )
    expect(CacheDependency.subscriptionLedger('sub_456')).toBe(
      'subscriptionLedger:sub_456'
    )
  })

  it('ignoreCache option bypasses cache and always executes the underlying function', async () => {
    const testKey = `${testKeyPrefix}_ignore_cache_test`
    const fullCacheKey = `${TEST_NAMESPACE}:${testKey}`
    keysToCleanup.push(fullCacheKey)

    let callCount = 0
    let currentValue = 'initial'
    const mockFn = async (id: string) => {
      callCount++
      return { id, value: currentValue }
    }

    const cachedFn = cached(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (id: string) => `${testKeyPrefix}_${id}`,
        schema: z.object({
          id: z.string(),
          value: z.string(),
        }),
        dependenciesFn: () => [],
      },
      mockFn
    )

    // First call without ignoreCache - should cache the result
    const result1 = await cachedFn('ignore_cache_test')
    expect(result1).toEqual({
      id: 'ignore_cache_test',
      value: 'initial',
    })
    expect(callCount).toBe(1)

    // Update the underlying data
    currentValue = 'updated'

    // Second call without ignoreCache - should return cached result
    const result2 = await cachedFn('ignore_cache_test')
    expect(result2).toEqual({
      id: 'ignore_cache_test',
      value: 'initial',
    })
    expect(callCount).toBe(1) // Function not called again

    // Third call with ignoreCache: true - should execute the function
    const result3 = await cachedFn('ignore_cache_test', {
      ignoreCache: true,
    })
    expect(result3).toEqual({
      id: 'ignore_cache_test',
      value: 'updated',
    })
    expect(callCount).toBe(2) // Function called again
  })

  it('ignoreCache option does not update the cache when bypassing', async () => {
    const client = getRedisTestClient()
    const testKey = `${testKeyPrefix}_ignore_no_write`
    const fullCacheKey = `${TEST_NAMESPACE}:${testKey}`
    keysToCleanup.push(fullCacheKey)

    let currentValue = 'first'
    const mockFn = async (id: string) => {
      return { id, value: currentValue }
    }

    const cachedFn = cached(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (id: string) => `${testKeyPrefix}_${id}`,
        schema: z.object({
          id: z.string(),
          value: z.string(),
        }),
        dependenciesFn: () => [],
      },
      mockFn
    )

    // First call - caches 'first'
    await cachedFn('ignore_no_write')

    // Verify cache has 'first'
    const cachedBefore = await client.get(fullCacheKey)
    const parsedBefore =
      typeof cachedBefore === 'string'
        ? JSON.parse(cachedBefore)
        : cachedBefore
    expect(parsedBefore.value).toBe('first')

    // Update underlying data
    currentValue = 'second'

    // Call with ignoreCache - should return 'second' but NOT update cache
    const result = await cachedFn('ignore_no_write', {
      ignoreCache: true,
    })
    expect(result.value).toBe('second')

    // Verify cache still has 'first'
    const cachedAfter = await client.get(fullCacheKey)
    const parsedAfter =
      typeof cachedAfter === 'string'
        ? JSON.parse(cachedAfter)
        : cachedAfter
    expect(parsedAfter.value).toBe('first')
  })

  it('ignoreCache option bypasses cache when cached function accepts multiple arguments', async () => {
    const testKey = `${testKeyPrefix}_multi_arg:true`
    const fullCacheKey = `${TEST_NAMESPACE}:${testKey}`
    keysToCleanup.push(fullCacheKey)

    let callCount = 0
    const mockFn = async (id: string, livemode: boolean) => {
      callCount++
      return { id, livemode, callNumber: callCount }
    }

    const cachedFn = cached(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (id: string, livemode: boolean) =>
          `${testKeyPrefix}_${id}:${livemode}`,
        schema: z.object({
          id: z.string(),
          livemode: z.boolean(),
          callNumber: z.number(),
        }),
        dependenciesFn: () => [],
      },
      mockFn
    )

    // First call - should cache
    const result1 = await cachedFn('multi_arg', true)
    expect(result1).toEqual({
      id: 'multi_arg',
      livemode: true,
      callNumber: 1,
    })
    expect(callCount).toBe(1)

    // Second call without options - should return cached
    const result2 = await cachedFn('multi_arg', true)
    expect(result2.callNumber).toBe(1)
    expect(callCount).toBe(1)

    // Third call with ignoreCache - should execute function
    const result3 = await cachedFn('multi_arg', true, {
      ignoreCache: true,
    })
    expect(result3.callNumber).toBe(2)
    expect(callCount).toBe(2)
  })

  it('end-to-end: cached function returns fresh data after dependency invalidation', async () => {
    const customerId = `${testKeyPrefix}_e2e_customer`
    const fullCacheKey = `${TEST_NAMESPACE}:${customerId}`
    const dependencyKey = `customerSubscriptions:${customerId}`
    const registryKey = `cacheDeps:${dependencyKey}`

    keysToCleanup.push(fullCacheKey, registryKey)

    let dataVersion = 1
    const mockFn = async (id: string) => {
      return { id, version: dataVersion }
    }

    const cachedFn = cached(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (id: string) => id,
        schema: z.object({
          id: z.string(),
          version: z.number(),
        }),
        dependenciesFn: (id: string) => [
          CacheDependency.customerSubscriptions(id),
        ],
      },
      mockFn
    )

    // First call - caches version 1
    const result1 = await cachedFn(customerId)
    expect(result1.version).toBe(1)

    // Simulate data change
    dataVersion = 2

    // Second call - should still return cached version 1
    const result2 = await cachedFn(customerId)
    expect(result2.version).toBe(1)

    // Invalidate the dependency
    await invalidateDependencies([dependencyKey])

    // Third call - should fetch fresh data (version 2)
    const result3 = await cachedFn(customerId)
    expect(result3.version).toBe(2)
  })

  it('selectUsageMeterBalancesForSubscriptionCached caches meter balances and invalidates on subscriptionLedger dependency', async () => {
    const client = getRedisTestClient()
    const subscriptionId = `${testKeyPrefix}_sub_meter_test`
    const fullCacheKey = `${RedisKeyNamespace.MeterBalancesBySubscription}:${subscriptionId}`
    const dependencyKey =
      CacheDependency.subscriptionLedger(subscriptionId)
    const registryKey = `cacheDeps:${dependencyKey}`

    keysToCleanup.push(fullCacheKey, registryKey)

    // Schema for meter balance result (simplified for testing)
    const usageMeterBalanceSchema = z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      aggregationType: z.string(),
      pricingModelId: z.string(),
      availableBalance: z.number(),
      subscriptionId: z.string(),
      createdAt: z.number(),
      updatedAt: z.number(),
    })
    const usageMeterBalanceWithSubscriptionIdSchema = z.object({
      usageMeterBalance: usageMeterBalanceSchema,
      subscriptionId: z.string(),
    })

    let callCount = 0
    let mockBalance = 100

    // Create a mock cached function that simulates selectUsageMeterBalancesForSubscriptionCached
    const mockMeterBalanceFn = async (subId: string) => {
      callCount++
      return [
        {
          usageMeterBalance: {
            id: 'meter_123',
            name: 'API Calls',
            slug: 'api-calls',
            aggregationType: 'sum',
            pricingModelId: 'pm_123',
            availableBalance: mockBalance,
            subscriptionId: subId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          subscriptionId: subId,
        },
      ]
    }

    const cachedMeterBalanceFn = cached(
      {
        namespace: RedisKeyNamespace.MeterBalancesBySubscription,
        keyFn: (subId: string) => subId,
        schema: usageMeterBalanceWithSubscriptionIdSchema.array(),
        dependenciesFn: (subId: string) => [
          CacheDependency.subscriptionLedger(subId),
        ],
      },
      mockMeterBalanceFn
    )

    // First call - should execute and cache
    const result1 = await cachedMeterBalanceFn(subscriptionId)
    expect(result1).toHaveLength(1)
    expect(result1[0].usageMeterBalance.availableBalance).toBe(100)
    expect(callCount).toBe(1)

    // Verify cache entry exists
    const storedValue = await client.get(fullCacheKey)
    expect(typeof storedValue).toBe('string')

    // Verify dependency is registered
    const registeredKeys = await client.smembers(registryKey)
    expect(registeredKeys).toContain(fullCacheKey)

    // Simulate balance change (e.g., usage event processed)
    mockBalance = 50

    // Second call - should return cached value (100)
    const result2 = await cachedMeterBalanceFn(subscriptionId)
    expect(result2[0].usageMeterBalance.availableBalance).toBe(100)
    expect(callCount).toBe(1) // Function not called again

    // Invalidate the subscription ledger dependency (simulates what ledger commands do)
    await invalidateDependencies([dependencyKey])

    // Third call - should fetch fresh data (50) since cache was invalidated
    const result3 = await cachedMeterBalanceFn(subscriptionId)
    expect(result3[0].usageMeterBalance.availableBalance).toBe(50)
    expect(callCount).toBe(2) // Function called again after invalidation
  })

  it('subscriptionLedger dependency invalidation clears meter balance cache entries for multiple subscriptions independently', async () => {
    const client = getRedisTestClient()
    const sub1Id = `${testKeyPrefix}_sub1`
    const sub2Id = `${testKeyPrefix}_sub2`

    const cacheKey1 = `${RedisKeyNamespace.MeterBalancesBySubscription}:${sub1Id}`
    const cacheKey2 = `${RedisKeyNamespace.MeterBalancesBySubscription}:${sub2Id}`
    const dep1Key = CacheDependency.subscriptionLedger(sub1Id)
    const dep2Key = CacheDependency.subscriptionLedger(sub2Id)
    const registry1Key = `cacheDeps:${dep1Key}`
    const registry2Key = `cacheDeps:${dep2Key}`

    keysToCleanup.push(
      cacheKey1,
      cacheKey2,
      registry1Key,
      registry2Key
    )

    // Manually set up cache entries and registries
    await client.set(cacheKey1, JSON.stringify([{ balance: 100 }]))
    await client.set(cacheKey2, JSON.stringify([{ balance: 200 }]))
    await client.sadd(registry1Key, cacheKey1)
    await client.sadd(registry2Key, cacheKey2)

    // Verify both cache entries exist
    expect(await client.get(cacheKey1)).toBe(
      JSON.stringify([{ balance: 100 }])
    )
    expect(await client.get(cacheKey2)).toBe(
      JSON.stringify([{ balance: 200 }])
    )

    // Invalidate only sub1's ledger dependency
    await invalidateDependencies([dep1Key])

    // sub1's cache should be cleared, sub2's should remain
    expect(await client.get(cacheKey1)).toBeNull()
    expect(await client.get(cacheKey2)).toBe(
      JSON.stringify([{ balance: 200 }])
    )

    // Now invalidate sub2's ledger dependency
    await invalidateDependencies([dep2Key])

    // Both should now be cleared
    expect(await client.get(cacheKey2)).toBeNull()
  })
})

describeIfRedisKey('cachedBulkLookup Integration Tests', () => {
  let testKeyPrefix: string
  let keysToCleanup: string[] = []

  beforeEach(() => {
    testKeyPrefix = generateTestKeyPrefix()
    keysToCleanup = []
  })

  afterEach(async () => {
    const client = getRedisTestClient()
    await cleanupRedisTestKeys(client, keysToCleanup)
  })

  it('performs MGET for multiple keys and returns cached values for hits while fetching misses', async () => {
    const client = getRedisTestClient()

    // Pre-populate cache for key1
    const key1CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_key1`
    const key1Data = [
      { id: 'item1', name: 'Cached Item 1', groupKey: 'key1' },
    ]
    await client.set(key1CacheKey, JSON.stringify(key1Data))

    const key2CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_key2`
    const key3CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_key3`
    const dep1Key = `${testKeyPrefix}_dep_key1`
    const dep2Key = `${testKeyPrefix}_dep_key2`
    const dep3Key = `${testKeyPrefix}_dep_key3`

    keysToCleanup.push(
      key1CacheKey,
      key2CacheKey,
      key3CacheKey,
      `cacheDeps:${dep1Key}`,
      `cacheDeps:${dep2Key}`,
      `cacheDeps:${dep3Key}`
    )

    let fetchCallCount = 0
    let fetchedKeys: string[] = []

    const itemSchema = z.object({
      id: z.string(),
      name: z.string(),
      groupKey: z.string(),
    })

    const results = await cachedBulkLookup(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (key: string) => `${testKeyPrefix}_${key}`,
        schema: itemSchema.array(),
        dependenciesFn: (key: string) => [
          `${testKeyPrefix}_dep_${key}`,
        ],
      },
      ['key1', 'key2', 'key3'],
      async (keys: string[]) => {
        fetchCallCount++
        fetchedKeys = keys
        // Return items for key2 and key3 (key1 should be a cache hit)
        return [
          { id: 'item2', name: 'Fetched Item 2', groupKey: 'key2' },
          { id: 'item3', name: 'Fetched Item 3', groupKey: 'key3' },
        ]
      },
      (item) => item.groupKey
    )

    // key1 should be from cache, key2 and key3 from fetch
    expect(fetchCallCount).toBe(1)
    expect(fetchedKeys).toEqual(['key2', 'key3'])

    expect(results.get('key1')).toEqual([
      { id: 'item1', name: 'Cached Item 1', groupKey: 'key1' },
    ])
    expect(results.get('key2')).toEqual([
      { id: 'item2', name: 'Fetched Item 2', groupKey: 'key2' },
    ])
    expect(results.get('key3')).toEqual([
      { id: 'item3', name: 'Fetched Item 3', groupKey: 'key3' },
    ])
  })

  it('returns empty map when given empty keys array', async () => {
    const results = await cachedBulkLookup(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (key: string) => key,
        schema: z.string().array(),
        dependenciesFn: () => [],
      },
      [],
      async () => [],
      (item) => item
    )

    expect(results.size).toBe(0)
  })

  it('caches fetched results and registers dependencies for each key', async () => {
    const client = getRedisTestClient()

    const key1CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_key1`
    const key2CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_key2`
    const dep1Key = `${testKeyPrefix}_dep_key1`
    const dep2Key = `${testKeyPrefix}_dep_key2`
    const registry1Key = `cacheDeps:${dep1Key}`
    const registry2Key = `cacheDeps:${dep2Key}`

    keysToCleanup.push(
      key1CacheKey,
      key2CacheKey,
      registry1Key,
      registry2Key
    )

    const itemSchema = z.object({
      id: z.string(),
      groupKey: z.string(),
    })

    await cachedBulkLookup(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (key: string) => `${testKeyPrefix}_${key}`,
        schema: itemSchema.array(),
        dependenciesFn: (key: string) => [
          `${testKeyPrefix}_dep_${key}`,
        ],
      },
      ['key1', 'key2'],
      async () => [
        { id: 'item1', groupKey: 'key1' },
        { id: 'item2', groupKey: 'key2' },
      ],
      (item) => item.groupKey
    )

    // Verify both keys are cached
    const cached1 = await client.get(key1CacheKey)
    const cached2 = await client.get(key2CacheKey)
    expect(Array.isArray(cached1)).toBe(true)
    expect(Array.isArray(cached2)).toBe(true)

    // Verify dependencies are registered
    const deps1 = await client.smembers(registry1Key)
    const deps2 = await client.smembers(registry2Key)
    expect(deps1).toContain(key1CacheKey)
    expect(deps2).toContain(key2CacheKey)
  })

  it('returns empty array for keys with no items from fetch', async () => {
    const key1CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_empty_key1`
    const dep1Key = `${testKeyPrefix}_dep_empty_key1`

    keysToCleanup.push(key1CacheKey, `cacheDeps:${dep1Key}`)

    type TestItem = { id: string; groupKey: string }

    const itemSchema = z.object({
      id: z.string(),
      groupKey: z.string(),
    })

    const results = await cachedBulkLookup(
      {
        namespace: TEST_NAMESPACE,
        keyFn: (key: string) => `${testKeyPrefix}_${key}`,
        schema: itemSchema.array(),
        dependenciesFn: (key: string) => [
          `${testKeyPrefix}_dep_${key}`,
        ],
      },
      ['empty_key1'],
      async (): Promise<TestItem[]> => [], // Fetch returns no items
      (item) => item.groupKey
    )

    // Should have an empty array for the key
    expect(results.get('empty_key1')).toEqual([])
  })

  it('invalidates cached entries when dependencies are invalidated', async () => {
    const client = getRedisTestClient()

    const key1CacheKey = `${TEST_NAMESPACE}:${testKeyPrefix}_inv_key1`
    const dep1Key = `${testKeyPrefix}_dep_inv_key1`
    const registry1Key = `cacheDeps:${dep1Key}`

    keysToCleanup.push(key1CacheKey, registry1Key)

    type TestItem = { id: string; groupKey: string }
    let fetchCount = 0

    const fetchFn = async (): Promise<TestItem[]> => {
      fetchCount++
      return [{ id: `item_v${fetchCount}`, groupKey: 'inv_key1' }]
    }

    const itemSchema = z.object({
      id: z.string(),
      groupKey: z.string(),
    })

    const config = {
      namespace: TEST_NAMESPACE,
      keyFn: (key: string) => `${testKeyPrefix}_${key}`,
      schema: itemSchema.array(),
      dependenciesFn: (key: string) => [
        `${testKeyPrefix}_dep_${key}`,
      ],
    }

    // First call - populates cache with v1
    const results1 = await cachedBulkLookup(
      config,
      ['inv_key1'],
      fetchFn,
      (item) => item.groupKey
    )
    expect(results1.get('inv_key1')?.[0]?.id).toBe('item_v1')
    expect(fetchCount).toBe(1)

    // Second call - should return cached v1
    const results2 = await cachedBulkLookup(
      config,
      ['inv_key1'],
      fetchFn,
      (item) => item.groupKey
    )
    expect(results2.get('inv_key1')?.[0]?.id).toBe('item_v1')
    expect(fetchCount).toBe(1) // No new fetch

    // Invalidate the dependency
    await invalidateDependencies([dep1Key])

    // Verify cache is cleared
    const cachedAfter = await client.get(key1CacheKey)
    expect(cachedAfter).toBeNull()

    // Third call - should fetch fresh data (v2)
    const results3 = await cachedBulkLookup(
      config,
      ['inv_key1'],
      fetchFn,
      (item) => item.groupKey
    )
    expect(results3.get('inv_key1')?.[0]?.id).toBe('item_v2')
    expect(fetchCount).toBe(2)
  })
})

describeIfRedisKey(
  'selectSubscriptionsByCustomerId Integration Tests',
  () => {
    let keysToCleanup: string[] = []

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
      keysToCleanup = []
    })

    it('caches subscription results and returns cached data on subsequent calls', async () => {
      const client = getRedisTestClient()

      // Setup test data
      const { organization, pricingModel } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const product = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Cache Test Product',
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Cache Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })

      // Track the cache key for cleanup (livemode is true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer.id}:true`
      const dependencyKey = CacheDependency.customerSubscriptions(
        customer.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      // First call - should cache the result
      const result1 = await adminTransaction(
        async ({ transaction, livemode }) => {
          return selectSubscriptionsByCustomerId(
            customer.id,
            transaction,
            livemode
          )
        }
      )

      expect(result1).toHaveLength(1)
      expect(result1[0].id).toBe(subscription.id)
      expect(result1[0].customerId).toBe(customer.id)

      // Verify data is in Redis
      const cachedValue = await client.get(cacheKey)
      expect(typeof cachedValue).toBe('object')

      // Second call - should return cached result
      const result2 = await adminTransaction(
        async ({ transaction, livemode }) => {
          return selectSubscriptionsByCustomerId(
            customer.id,
            transaction,
            livemode
          )
        }
      )

      expect(result2).toHaveLength(1)
      expect(result2[0].id).toBe(subscription.id)
    })

    it('returns empty array for customer with no subscriptions and caches the empty result', async () => {
      const client = getRedisTestClient()

      // Setup test data - customer with no subscriptions
      const { organization } = await setupOrg()
      const customerWithNoSubs = await setupCustomer({
        organizationId: organization.id,
      })

      // Track the cache key for cleanup (livemode is true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customerWithNoSubs.id}:true`
      const dependencyKey = CacheDependency.customerSubscriptions(
        customerWithNoSubs.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      // First call - should cache the empty result
      const result = await adminTransaction(
        async ({ transaction, livemode }) => {
          return selectSubscriptionsByCustomerId(
            customerWithNoSubs.id,
            transaction,
            livemode
          )
        }
      )

      expect(result).toEqual([])

      // Verify the empty array is cached
      const cachedValue = await client.get(cacheKey)
      expect(typeof cachedValue).toBe('object')
      const parsedValue =
        typeof cachedValue === 'string'
          ? JSON.parse(cachedValue)
          : cachedValue
      expect(parsedValue).toEqual([])
    })

    it('registers customer dependency that can be invalidated', async () => {
      const client = getRedisTestClient()

      // Setup test data
      const { organization, pricingModel } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const product = await setupProduct({
        organizationId: organization.id,
        pricingModelId: pricingModel.id,
        name: 'Invalidation Test Product',
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Invalidation Test Price',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
      })
      await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })

      // Track keys for cleanup (livemode is true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer.id}:true`
      const dependencyKey = CacheDependency.customerSubscriptions(
        customer.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      // Populate cache
      await adminTransaction(async ({ transaction, livemode }) => {
        return selectSubscriptionsByCustomerId(
          customer.id,
          transaction,
          livemode
        )
      })

      // Verify cache is populated
      const beforeInvalidation = await client.get(cacheKey)
      expect(typeof beforeInvalidation).toBe('object')

      // Verify dependency is registered
      const registeredKeys = await client.smembers(registryKey)
      expect(registeredKeys).toContain(cacheKey)

      // Invalidate the customer dependency
      await invalidateDependencies([dependencyKey])

      // Verify cache is cleared
      const afterInvalidation = await client.get(cacheKey)
      expect(afterInvalidation).toBeNull()
    })
  }
)
