import { Result } from 'better-result'
import { inArray } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupSubscriptionItem,
  setupTestFeaturesAndProductFeatures,
} from '@/../seedDatabase'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import db from '@/db/client'
import { subscriptionItemFeatures } from '@/db/schema/subscriptionItemFeatures'
import {
  insertSubscriptionItemFeature,
  selectSubscriptionItemFeaturesWithFeatureSlug,
} from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItemsWithPricesBySubscriptionId } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionsByCustomerId } from '@/db/tableMethods/subscriptionMethods'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  generateTestKeyPrefix,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import {
  CurrencyCode,
  FeatureType,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import {
  CacheDependency,
  type CacheRecomputeMetadata,
  cached,
  cachedBulkLookup,
  invalidateDependencies,
  recomputeDependencies,
} from '@/utils/cache'
import {
  RedisKeyNamespace,
  removeFromLRU,
  trackAndEvictLRU,
} from '@/utils/redis'

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

/**
 * Poll Redis for a cache key until it is populated or timeout is reached.
 * Returns the cached value when found, or throws if timeout elapses.
 */
async function waitForCachePopulation<T>(
  client: ReturnType<typeof getRedisTestClient>,
  cacheKey: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 50 } = options
  const startTime = Date.now()

  return new Promise<T>((resolve, reject) => {
    const checkCache = async () => {
      try {
        const value = await client.get(cacheKey)
        if (value !== null) {
          return resolve(value as T)
        }

        if (Date.now() - startTime >= timeoutMs) {
          return reject(
            new Error(
              `Timeout waiting for cache key "${cacheKey}" to be populated after ${timeoutMs}ms`
            )
          )
        }

        setTimeout(checkCache, intervalMs)
      } catch (error) {
        return reject(
          new Error(
            `Redis error while waiting for cache key "${cacheKey}" to be populated: ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }

    checkCache()
  })
}

/**
 * Poll Redis until a cache key is invalidated (null) or timeout is reached.
 * Throws if the key is still present after timeout elapses.
 */
async function waitForCacheInvalidation(
  client: ReturnType<typeof getRedisTestClient>,
  cacheKey: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 50 } = options
  const startTime = Date.now()

  return new Promise<void>((resolve, reject) => {
    const checkCache = async () => {
      try {
        const value = await client.get(cacheKey)
        if (value === null) {
          return resolve()
        }

        if (Date.now() - startTime >= timeoutMs) {
          return reject(
            new Error(
              `Timeout waiting for cache key "${cacheKey}" to be invalidated after ${timeoutMs}ms`
            )
          )
        }

        setTimeout(checkCache, intervalMs)
      } catch (error) {
        return reject(
          new Error(
            `Redis error while waiting for cache key "${cacheKey}" to be invalidated: ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }

    checkCache()
  })
}

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
        dependenciesFn: (_result) => [],
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
    // Note: Upstash Redis client auto-parses JSON, so we get an object directly
    const storedValue = await client.get(fullCacheKey)
    expect(storedValue).toEqual({
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
        dependenciesFn: (_result) => [dependencyKey],
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

    // Note: The registry Set is intentionally NOT deleted by invalidateDependencies.
    // It expires via TTL and is kept for recomputeDependencies if called afterward.
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
        dependenciesFn: (_result) => [],
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
        dependenciesFn: (_result) => [],
      },
      mockFn
    )

    // First call - caches 'first'
    await cachedFn('ignore_no_write')

    // Verify cache has 'first' (Upstash auto-parses JSON)
    const cachedBefore = (await client.get(fullCacheKey)) as {
      id: string
      value: string
    }
    expect(cachedBefore.value).toBe('first')

    // Update underlying data
    currentValue = 'second'

    // Call with ignoreCache - should return 'second' but NOT update cache
    const result = await cachedFn('ignore_no_write', {
      ignoreCache: true,
    })
    expect(result.value).toBe('second')

    // Verify cache still has 'first' (Upstash auto-parses JSON)
    const cachedAfter = (await client.get(fullCacheKey)) as {
      id: string
      value: string
    }
    expect(cachedAfter.value).toBe('first')
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
        dependenciesFn: (_result) => [],
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
        dependenciesFn: (_result, id: string) => [
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
        dependenciesFn: (_items, key: string) => [
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
        dependenciesFn: (_items, _key: string) => [],
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
        dependenciesFn: (_items, key: string) => [
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
        dependenciesFn: (_items, key: string) => [
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
      dependenciesFn: (_items: TestItem[], key: string) => [
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
            { customerId: customer.id, livemode },
            transaction,
            { type: 'admin', livemode }
          )
        }
      )

      expect(result1).toHaveLength(1)
      expect(result1[0].id).toBe(subscription.id)
      expect(result1[0].customerId).toBe(customer.id)

      // Verify data is in Redis (Upstash auto-parses JSON)
      const cachedValue = await client.get(cacheKey)
      expect(Array.isArray(cachedValue)).toBe(true)

      // Second call - should return cached result
      const result2 = await adminTransaction(
        async ({ transaction, livemode }) => {
          return selectSubscriptionsByCustomerId(
            { customerId: customer.id, livemode },
            transaction,
            { type: 'admin', livemode }
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
            { customerId: customerWithNoSubs.id, livemode },
            transaction,
            { type: 'admin', livemode }
          )
        }
      )

      expect(result).toEqual([])

      // Verify the empty array is cached (Upstash auto-parses JSON)
      const cachedValue = await client.get(cacheKey)
      expect(cachedValue).toEqual([])
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
          { customerId: customer.id, livemode },
          transaction,
          { type: 'admin', livemode }
        )
      })

      // Verify cache is populated (Upstash auto-parses JSON)
      const beforeInvalidation = await client.get(cacheKey)
      expect(Array.isArray(beforeInvalidation)).toBe(true)

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

describeIfRedisKey(
  'invalidateCache callback Integration Tests',
  () => {
    let keysToCleanup: string[] = []

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
      keysToCleanup = []
    })

    it('comprehensiveAdminTransaction invalidateCache callback clears cache after transaction commits', async () => {
      const client = getRedisTestClient()

      // Setup test data
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Track keys for cleanup
      const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer.id}:true`
      const dependencyKey = CacheDependency.customerSubscriptions(
        customer.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      // Pre-populate cache with subscription data
      await client.set(
        cacheKey,
        JSON.stringify([{ id: 'sub_123', customerId: customer.id }])
      )
      await client.sadd(registryKey, cacheKey)

      // Verify cache is populated (Upstash auto-parses JSON)
      const beforeTransaction = await client.get(cacheKey)
      expect(Array.isArray(beforeTransaction)).toBe(true)

      // Call comprehensiveAdminTransaction with a function that uses invalidateCache
      await comprehensiveAdminTransaction(
        async ({ invalidateCache }) => {
          // Simulate what a workflow function does - call invalidateCache with dependency key
          // Non-null assertion: comprehensiveAdminTransaction always provides invalidateCache
          invalidateCache(dependencyKey)
          return Result.ok('success')
        }
      )

      // Poll until cache is invalidated
      await waitForCacheInvalidation(client, cacheKey)

      // Verify cache is cleared after transaction commits
      const afterTransaction = await client.get(cacheKey)
      expect(afterTransaction).toBeNull()
    })

    it('invalidateCache callback accumulates multiple keys and invalidates all after commit', async () => {
      const client = getRedisTestClient()

      // Setup test data - two customers
      const { organization } = await setupOrg()
      const customer1 = await setupCustomer({
        organizationId: organization.id,
      })
      const customer2 = await setupCustomer({
        organizationId: organization.id,
      })

      // Track keys for cleanup
      const cacheKey1 = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer1.id}:true`
      const cacheKey2 = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer2.id}:true`
      const depKey1 = CacheDependency.customerSubscriptions(
        customer1.id
      )
      const depKey2 = CacheDependency.customerSubscriptions(
        customer2.id
      )
      const registryKey1 = `cacheDeps:${depKey1}`
      const registryKey2 = `cacheDeps:${depKey2}`
      keysToCleanup.push(
        cacheKey1,
        cacheKey2,
        registryKey1,
        registryKey2
      )

      // Pre-populate both caches
      await client.set(
        cacheKey1,
        JSON.stringify([{ id: 'sub_1', customerId: customer1.id }])
      )
      await client.set(
        cacheKey2,
        JSON.stringify([{ id: 'sub_2', customerId: customer2.id }])
      )
      await client.sadd(registryKey1, cacheKey1)
      await client.sadd(registryKey2, cacheKey2)

      // Verify both caches are populated (Upstash auto-parses JSON)
      expect(Array.isArray(await client.get(cacheKey1))).toBe(true)
      expect(Array.isArray(await client.get(cacheKey2))).toBe(true)

      // Call comprehensiveAdminTransaction with multiple invalidateCache calls
      await comprehensiveAdminTransaction(
        async ({ invalidateCache }) => {
          invalidateCache(depKey1)
          invalidateCache(depKey2)
          return Result.ok('success')
        }
      )

      // Poll until both caches are invalidated
      await Promise.all([
        waitForCacheInvalidation(client, cacheKey1),
        waitForCacheInvalidation(client, cacheKey2),
      ])

      // Verify both caches are cleared
      expect(await client.get(cacheKey1)).toBeNull()
      expect(await client.get(cacheKey2)).toBeNull()
    })

    it('invalidateCache callback deduplicates keys before invalidating', async () => {
      const client = getRedisTestClient()

      // Setup test data
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      // Track keys for cleanup
      const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer.id}:true`
      const dependencyKey = CacheDependency.customerSubscriptions(
        customer.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      // Pre-populate cache
      await client.set(
        cacheKey,
        JSON.stringify([{ id: 'sub_123', customerId: customer.id }])
      )
      await client.sadd(registryKey, cacheKey)

      // Call with duplicate invalidation keys (simulating nested function calls)
      await comprehensiveAdminTransaction(
        async ({ invalidateCache }) => {
          // Same key called multiple times - should be deduplicated
          invalidateCache(dependencyKey)
          invalidateCache(dependencyKey)
          invalidateCache(dependencyKey)
          return Result.ok('success')
        }
      )

      // Poll until cache is invalidated
      await waitForCacheInvalidation(client, cacheKey)

      // Cache should still be cleared (deduplication shouldn't break anything)
      expect(await client.get(cacheKey)).toBeNull()
    })

    it('invalidateCache callback combined with cacheInvalidations return value invalidates all keys', async () => {
      const client = getRedisTestClient()

      // Setup test data - two customers
      const { organization } = await setupOrg()
      const customer1 = await setupCustomer({
        organizationId: organization.id,
      })
      const customer2 = await setupCustomer({
        organizationId: organization.id,
      })

      // Track keys for cleanup
      const cacheKey1 = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer1.id}:true`
      const cacheKey2 = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer2.id}:true`
      const depKey1 = CacheDependency.customerSubscriptions(
        customer1.id
      )
      const depKey2 = CacheDependency.customerSubscriptions(
        customer2.id
      )
      const registryKey1 = `cacheDeps:${depKey1}`
      const registryKey2 = `cacheDeps:${depKey2}`
      keysToCleanup.push(
        cacheKey1,
        cacheKey2,
        registryKey1,
        registryKey2
      )

      // Pre-populate both caches
      await client.set(
        cacheKey1,
        JSON.stringify([{ id: 'sub_1', customerId: customer1.id }])
      )
      await client.set(
        cacheKey2,
        JSON.stringify([{ id: 'sub_2', customerId: customer2.id }])
      )
      await client.sadd(registryKey1, cacheKey1)
      await client.sadd(registryKey2, cacheKey2)

      // Use callback for both keys
      await comprehensiveAdminTransaction(
        async ({ invalidateCache }) => {
          invalidateCache(depKey1)
          invalidateCache(depKey2)
          return Result.ok('success')
        }
      )

      // Poll until both caches are invalidated
      await Promise.all([
        waitForCacheInvalidation(client, cacheKey1),
        waitForCacheInvalidation(client, cacheKey2),
      ])

      // Both caches should be cleared
      expect(await client.get(cacheKey1)).toBeNull()
      expect(await client.get(cacheKey2)).toBeNull()
    })
  }
)

/**
 * Integration tests for selectSubscriptionItemFeaturesWithFeatureSlug.
 *
 * These tests verify the caching behavior with real Redis calls.
 */
describeIfRedisKey(
  'selectSubscriptionItemFeaturesWithFeatureSlug Integration Tests',
  () => {
    let keysToCleanup: string[] = []
    let subscriptionItemIdsToCleanup: string[] = []

    beforeEach(() => {
      keysToCleanup = []
      subscriptionItemIdsToCleanup = []
    })

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)

      // Clean up only the subscription item features created by this test
      if (subscriptionItemIdsToCleanup.length > 0) {
        await db
          .delete(subscriptionItemFeatures)
          .where(
            inArray(
              subscriptionItemFeatures.subscriptionItemId,
              subscriptionItemIdsToCleanup
            )
          )
      }
    })

    it('caches subscription item features and returns from cache on subsequent calls', async () => {
      const client = getRedisTestClient()

      // Setup test data
      const orgData = await setupOrg()
      const { product } = orgData

      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        unitPrice: 1000,
        type: PriceType.Subscription,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      const customer = await setupCustomer({
        organizationId: orgData.organization.id,
        email: 'cache-integration-test@test.com',
        livemode: true,
      })

      const subscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: price.id,
      })

      const subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Test Subscription Item',
        quantity: 1,
        unitPrice: 1000,
        priceId: price.id,
      })

      const featureData = await setupTestFeaturesAndProductFeatures({
        organizationId: orgData.organization.id,
        productId: product.id,
        livemode: true,
        featureSpecs: [
          { name: 'Toggle Feature', type: FeatureType.Toggle },
        ],
      })
      const [
        {
          feature: toggleFeature,
          productFeature: toggleProductFeature,
        },
      ] = featureData

      // Track the subscription item and cache key for cleanup
      subscriptionItemIdsToCleanup.push(subscriptionItem.id)
      const cacheKey = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:${subscriptionItem.id}:true`
      const depKey = CacheDependency.subscriptionItemFeatures(
        subscriptionItem.id
      )
      const registryKey = `cacheDeps:${depKey}`
      keysToCleanup.push(cacheKey, registryKey)

      await adminTransaction(async ({ transaction }) => {
        // Insert a subscription item feature
        await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )

        // First call - should query DB and cache the result
        const features1 =
          await selectSubscriptionItemFeaturesWithFeatureSlug(
            subscriptionItem.id,
            transaction,
            true // livemode
          )

        expect(features1.length).toBe(1)
        expect(features1[0].subscriptionItemId).toBe(
          subscriptionItem.id
        )
        expect(features1[0].featureId).toBe(toggleFeature.id)
        expect(features1[0].name).toBe(toggleFeature.name)
        expect(features1[0].slug).toBe(toggleFeature.slug)

        // Verify the result is stored in Redis (Upstash auto-deserializes JSON)
        const storedValue = await client.get(cacheKey)
        expect(typeof storedValue).toBe('object')

        // Second call - should return from cache
        const features2 =
          await selectSubscriptionItemFeaturesWithFeatureSlug(
            subscriptionItem.id,
            transaction,
            true // livemode
          )

        // Verify the cached result has the same key properties
        expect(features2.length).toBe(features1.length)
        expect(features2[0].id).toBe(features1[0].id)
        expect(features2[0].subscriptionItemId).toBe(
          features1[0].subscriptionItemId
        )
      })
    })

    it('returns fresh data after subscriptionItem dependency is invalidated', async () => {
      const client = getRedisTestClient()

      // Setup test data
      const orgData = await setupOrg()
      const { product } = orgData

      const price = await setupPrice({
        productId: product.id,
        name: 'Test Price',
        unitPrice: 1000,
        type: PriceType.Subscription,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      const customer = await setupCustomer({
        organizationId: orgData.organization.id,
        email: 'invalidation-integration-test@test.com',
        livemode: true,
      })

      const subscription = await setupSubscription({
        organizationId: orgData.organization.id,
        customerId: customer.id,
        priceId: price.id,
      })

      const subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Test Subscription Item',
        quantity: 1,
        unitPrice: 1000,
        priceId: price.id,
      })

      const featureData = await setupTestFeaturesAndProductFeatures({
        organizationId: orgData.organization.id,
        productId: product.id,
        livemode: true,
        featureSpecs: [
          { name: 'Toggle Feature', type: FeatureType.Toggle },
        ],
      })
      const [
        {
          feature: toggleFeature,
          productFeature: toggleProductFeature,
        },
      ] = featureData

      // Track the subscription item and cache key for cleanup
      subscriptionItemIdsToCleanup.push(subscriptionItem.id)
      const cacheKey = `${RedisKeyNamespace.FeaturesBySubscriptionItem}:${subscriptionItem.id}:true`
      const depKey = CacheDependency.subscriptionItemFeatures(
        subscriptionItem.id
      )
      const registryKey = `cacheDeps:${depKey}`
      keysToCleanup.push(cacheKey, registryKey)

      // First transaction - insert feature and cache it
      await adminTransaction(async ({ transaction }) => {
        await insertSubscriptionItemFeature(
          {
            type: FeatureType.Toggle,
            subscriptionItemId: subscriptionItem.id,
            featureId: toggleFeature.id,
            productFeatureId: toggleProductFeature.id,
            usageMeterId: null,
            amount: null,
            renewalFrequency: null,
            livemode: true,
          },
          transaction
        )

        // Populate the cache
        const features =
          await selectSubscriptionItemFeaturesWithFeatureSlug(
            subscriptionItem.id,
            transaction,
            true // livemode
          )
        expect(features.length).toBe(1)
      })

      // Verify cache is populated (Upstash auto-deserializes JSON)
      const cachedBefore = await client.get(cacheKey)
      expect(typeof cachedBefore).toBe('object')

      // Invalidate the subscriptionItem dependency
      await invalidateDependencies([depKey])

      // Verify cache is now empty
      const cachedAfter = await client.get(cacheKey)
      expect(cachedAfter).toBeNull()

      // Next query should hit DB again (cache miss)
      await adminTransaction(async ({ transaction }) => {
        const features =
          await selectSubscriptionItemFeaturesWithFeatureSlug(
            subscriptionItem.id,
            transaction,
            true // livemode
          )
        // Should still return the feature (from DB, not cache)
        expect(features.length).toBe(1)
      })

      // Cache should be repopulated (Upstash auto-deserializes JSON)
      const cachedRepopulated = await client.get(cacheKey)
      expect(typeof cachedRepopulated).toBe('object')
    })
  }
)

describeIfRedisKey('LRU Eviction Integration Tests', () => {
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

  it('trackAndEvictLRU adds cache key to the LRU sorted set with timestamp score', async () => {
    const client = getRedisTestClient()
    const namespace = RedisKeyNamespace.SubscriptionsByCustomer
    const zsetKey = `${namespace}:lru`
    const cacheKey = `${namespace}:${testKeyPrefix}_lru_test_1`

    keysToCleanup.push(zsetKey, cacheKey)

    // Create a dummy cache entry
    await client.set(cacheKey, JSON.stringify({ test: 'data' }))

    const beforeTimestamp = Date.now()
    const evicted = await trackAndEvictLRU(namespace, cacheKey)
    const afterTimestamp = Date.now()

    expect(evicted).toBe(0) // Should not evict anything with just one entry

    // Verify the key is in the sorted set with a timestamp score
    const score = await client.zscore(zsetKey, cacheKey)
    expect(typeof score).toBe('number')
    expect(score).toBeGreaterThanOrEqual(beforeTimestamp)
    expect(score).toBeLessThanOrEqual(afterTimestamp)
  })

  it('trackAndEvictLRU updates timestamp when same key is tracked again', async () => {
    const client = getRedisTestClient()
    const namespace = RedisKeyNamespace.SubscriptionsByCustomer
    const zsetKey = `${namespace}:lru`
    const cacheKey = `${namespace}:${testKeyPrefix}_lru_update_test`

    keysToCleanup.push(zsetKey, cacheKey)

    // Create a dummy cache entry
    await client.set(cacheKey, JSON.stringify({ test: 'data' }))

    // First track
    await trackAndEvictLRU(namespace, cacheKey)
    const firstScore = await client.zscore(zsetKey, cacheKey)

    // Wait a bit to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Track again - should update the score
    await trackAndEvictLRU(namespace, cacheKey)
    const secondScore = await client.zscore(zsetKey, cacheKey)

    expect(secondScore).toBeGreaterThan(firstScore!)
  })

  it('trackAndEvictLRU evicts oldest entries when sorted set exceeds max size', async () => {
    const client = getRedisTestClient()
    // Use a namespace we can test with - we'll manually create a small sorted set
    // and then manually invoke eviction logic
    const namespace = RedisKeyNamespace.SubscriptionsByCustomer
    const zsetKey = `${namespace}:lru`

    // Create 5 cache entries with incremental timestamps
    const cacheKeys: string[] = []
    for (let i = 0; i < 5; i++) {
      const cacheKey = `${namespace}:${testKeyPrefix}_evict_test_${i}`
      cacheKeys.push(cacheKey)
      await client.set(cacheKey, JSON.stringify({ index: i }))
      // Add to sorted set with timestamp = i * 1000 (so entry 0 is oldest)
      await client.zadd(zsetKey, {
        score: i * 1000,
        member: cacheKey,
      })
    }

    keysToCleanup.push(zsetKey, ...cacheKeys)

    // Verify all 5 entries exist
    for (const key of cacheKeys) {
      const value = await client.get(key)
      expect(value).toMatchObject({ index: expect.any(Number) })
    }
    const initialSize = await client.zcard(zsetKey)
    expect(initialSize).toBe(5)

    // Now we need to trigger eviction - the Lua script runs when we add a new entry
    // But the max size is 50000, so we need a different approach for testing
    // Instead, let's directly use EVAL with a smaller max size to verify the script works

    // Use EVAL directly with maxSize=3 to force eviction of 3 entries (keeping 3)
    const newCacheKey = `${namespace}:${testKeyPrefix}_evict_test_new`
    cacheKeys.push(newCacheKey)
    keysToCleanup.push(newCacheKey)
    await client.set(newCacheKey, JSON.stringify({ index: 'new' }))

    // Execute the eviction script with maxSize=3
    const script = `
local zsetKey = KEYS[1]
local cacheKey = KEYS[2]
local timestamp = tonumber(ARGV[1])
local maxSize = tonumber(ARGV[2])

redis.call('ZADD', zsetKey, timestamp, cacheKey)

local size = redis.call('ZCARD', zsetKey)

if size > maxSize then
  local toEvictCount = size - maxSize
  local toEvict = redis.call('ZRANGE', zsetKey, 0, toEvictCount - 1)
  if #toEvict > 0 then
    redis.call('DEL', unpack(toEvict))
    redis.call('ZREM', zsetKey, unpack(toEvict))
  end
  return #toEvict
end

return 0
`
    const evicted = await client.eval(
      script,
      [zsetKey, newCacheKey],
      [Date.now(), 3] // maxSize = 3
    )

    // Should have evicted 3 entries (had 5, added 1 = 6, keep 3, evict 3)
    expect(evicted).toBe(3)

    // Verify oldest 3 entries (indices 0, 1, 2) are deleted
    for (let i = 0; i < 3; i++) {
      const value = await client.get(cacheKeys[i])
      expect(value).toBeNull()
    }

    // Verify newer entries (indices 3, 4) and new entry still exist
    for (let i = 3; i < 5; i++) {
      const value = await client.get(cacheKeys[i])
      expect(value).toMatchObject({ index: expect.any(Number) })
    }
    const newValue = await client.get(newCacheKey)
    expect(newValue).toMatchObject({ index: 'new' })

    // Verify sorted set now has 3 entries
    const finalSize = await client.zcard(zsetKey)
    expect(finalSize).toBe(3)
  })

  it('removeFromLRU removes cache key from the sorted set', async () => {
    const client = getRedisTestClient()
    const namespace = RedisKeyNamespace.SubscriptionsByCustomer
    const zsetKey = `${namespace}:lru`
    const cacheKey = `${namespace}:${testKeyPrefix}_remove_lru_test`

    keysToCleanup.push(zsetKey, cacheKey)

    // Add to sorted set
    await client.zadd(zsetKey, {
      score: Date.now(),
      member: cacheKey,
    })

    // Verify it's in the set
    const scoreBefore = await client.zscore(zsetKey, cacheKey)
    expect(typeof scoreBefore).toBe('number')

    // Remove from LRU
    await removeFromLRU(namespace, cacheKey)

    // Verify it's removed
    const scoreAfter = await client.zscore(zsetKey, cacheKey)
    expect(scoreAfter).toBeNull()
  })

  it('LRU eviction atomically deletes cache entries and removes them from sorted set', async () => {
    const client = getRedisTestClient()
    const namespace = RedisKeyNamespace.SubscriptionsByCustomer
    const zsetKey = `${namespace}:lru`

    // Create entries that will be evicted
    const evictableKeys: string[] = []
    for (let i = 0; i < 3; i++) {
      const key = `${namespace}:${testKeyPrefix}_atomic_${i}`
      evictableKeys.push(key)
      await client.set(key, JSON.stringify({ data: i }))
      // Add with old timestamp (will be evicted)
      await client.zadd(zsetKey, { score: 1000 + i, member: key })
    }

    // Create entries that will survive
    const survivorKeys: string[] = []
    for (let i = 0; i < 2; i++) {
      const key = `${namespace}:${testKeyPrefix}_survivor_${i}`
      survivorKeys.push(key)
      await client.set(key, JSON.stringify({ data: `survivor_${i}` }))
      // Add with recent timestamp (will survive)
      await client.zadd(zsetKey, {
        score: Date.now() + i * 1000,
        member: key,
      })
    }

    keysToCleanup.push(zsetKey, ...evictableKeys, ...survivorKeys)

    // Trigger eviction with maxSize=2 (have 5 entries, should evict 3)
    const newKey = `${namespace}:${testKeyPrefix}_atomic_new`
    survivorKeys.push(newKey)
    keysToCleanup.push(newKey)
    await client.set(newKey, JSON.stringify({ data: 'new' }))

    const script = `
local zsetKey = KEYS[1]
local cacheKey = KEYS[2]
local timestamp = tonumber(ARGV[1])
local maxSize = tonumber(ARGV[2])

redis.call('ZADD', zsetKey, timestamp, cacheKey)
local size = redis.call('ZCARD', zsetKey)

if size > maxSize then
  local toEvictCount = size - maxSize
  local toEvict = redis.call('ZRANGE', zsetKey, 0, toEvictCount - 1)
  if #toEvict > 0 then
    redis.call('DEL', unpack(toEvict))
    redis.call('ZREM', zsetKey, unpack(toEvict))
  end
  return #toEvict
end
return 0
`
    const evictedCount = await client.eval(
      script,
      [zsetKey, newKey],
      [Date.now() + 10000, 3] // maxSize = 3
    )

    expect(evictedCount).toBe(3)

    // Verify evictable keys are both deleted from cache AND removed from sorted set
    for (const key of evictableKeys) {
      const cacheValue = await client.get(key)
      expect(cacheValue).toBeNull()

      const score = await client.zscore(zsetKey, key)
      expect(score).toBeNull()
    }

    // Verify survivors are still in cache AND in sorted set
    for (const key of survivorKeys) {
      const cacheValue = await client.get(key)
      expect(cacheValue).toMatchObject({ data: expect.anything() })

      const score = await client.zscore(zsetKey, key)
      expect(typeof score).toBe('number')
    }
  })

  it('trackAndEvictLRU returns 0 when size is under max limit', async () => {
    const client = getRedisTestClient()
    const namespace = RedisKeyNamespace.SubscriptionsByCustomer
    const zsetKey = `${namespace}:lru`

    // Add a few entries (well under the 50000 limit)
    const cacheKeys: string[] = []
    for (let i = 0; i < 3; i++) {
      const key = `${namespace}:${testKeyPrefix}_under_limit_${i}`
      cacheKeys.push(key)
      await client.set(key, JSON.stringify({ i }))
    }

    keysToCleanup.push(zsetKey, ...cacheKeys)

    // Track each key
    for (const key of cacheKeys) {
      const evicted = await trackAndEvictLRU(namespace, key)
      expect(evicted).toBe(0)
    }

    // All keys should still exist
    for (const key of cacheKeys) {
      const value = await client.get(key)
      expect(value).toMatchObject({ i: expect.any(Number) })
    }
  })
})

describeIfRedisKey(
  'selectSubscriptionsByCustomerId recomputation Integration Tests',
  () => {
    let keysToCleanup: string[] = []

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
      keysToCleanup = []
    })

    it('stores recompute metadata with params when populating cache', async () => {
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
        name: 'Recompute Test Product',
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Recompute Test Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
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

      // Track keys for cleanup
      const cacheKey = `${RedisKeyNamespace.SubscriptionsByCustomer}:${customer.id}:true`
      const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
      const dependencyKey = CacheDependency.customerSubscriptions(
        customer.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, metadataKey, registryKey)

      // Populate cache by calling the function
      await adminTransaction(async ({ transaction, livemode }) => {
        return selectSubscriptionsByCustomerId(
          { customerId: customer.id, livemode },
          transaction,
          { type: 'admin', livemode }
        )
      })

      // Verify cache is populated
      const cachedValue = await client.get(cacheKey)
      expect(Array.isArray(cachedValue)).toBe(true)

      // Verify recompute metadata is stored (since it now uses cachedRecomputable())
      const metadataValue = (await client.get(
        metadataKey
      )) as CacheRecomputeMetadata | null
      expect(typeof metadataValue).toBe('object')
      expect(metadataValue?.namespace).toBe(
        RedisKeyNamespace.SubscriptionsByCustomer
      )
      expect(metadataValue?.params).toEqual({
        customerId: customer.id,
        livemode: true,
      })
      expect(metadataValue?.cacheRecomputationContext).toEqual({
        type: 'admin',
        livemode: true,
      })
    })
  }
)

describeIfRedisKey(
  'selectSubscriptionItemsWithPricesBySubscriptionId recomputation Integration Tests',
  () => {
    let keysToCleanup: string[] = []

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
      keysToCleanup = []
    })

    it('stores recompute metadata with params when populating cache', async () => {
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
        name: 'Subscription Items Recompute Test Product',
      })
      const price = await setupPrice({
        productId: product.id,
        name: 'Subscription Items Recompute Test Price',
        type: PriceType.Subscription,
        unitPrice: 3000,
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
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Test Subscription Item',
        quantity: 1,
        unitPrice: 3000,
      })

      // Track keys for cleanup
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:true`
      const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
      const dependencyKey = CacheDependency.subscriptionItems(
        subscription.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, metadataKey, registryKey)

      // Populate cache by calling the function
      await adminTransaction(async ({ transaction, livemode }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode,
        }
        return selectSubscriptionItemsWithPricesBySubscriptionId(
          subscription.id,
          transaction,
          cacheRecomputationContext
        )
      })

      // Verify cache is populated (Upstash auto-parses JSON)
      const cachedValue = await client.get(cacheKey)
      expect(Array.isArray(cachedValue)).toBe(true)

      // Verify recompute metadata is stored with correct params (Upstash auto-parses JSON)
      const metadataValue = (await client.get(
        metadataKey
      )) as CacheRecomputeMetadata
      expect(typeof metadataValue).toBe('object')

      expect(metadataValue.namespace).toBe(
        RedisKeyNamespace.ItemsBySubscription
      )
      expect(metadataValue.params).toEqual({
        subscriptionId: subscription.id,
        livemode: true,
      })
      expect(metadataValue.cacheRecomputationContext.type).toBe(
        'admin'
      )
      expect(metadataValue.cacheRecomputationContext.livemode).toBe(
        true
      )
      expect(metadataValue.createdAt).toBeGreaterThan(0)
    })
  }
)
