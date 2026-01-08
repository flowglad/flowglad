import { afterEach, beforeEach, expect, it } from 'vitest'
import { z } from 'zod'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  generateTestKeyPrefix,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import {
  CacheDependency,
  cached,
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
    expect(storedValue).not.toBeNull()
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
    expect(beforeEntry1).not.toBeNull()
    expect(beforeEntry2).not.toBeNull()

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
    expect(CacheDependency.customer('cust_123')).toBe(
      'customer:cust_123'
    )
    expect(CacheDependency.subscription('sub_456')).toBe(
      'subscription:sub_456'
    )
    expect(CacheDependency.subscriptionItem('si_789')).toBe(
      'subscriptionItem:si_789'
    )
    expect(CacheDependency.subscriptionLedger('sub_456')).toBe(
      'ledger:sub_456'
    )
  })

  it('end-to-end: cached function returns fresh data after dependency invalidation', async () => {
    const customerId = `${testKeyPrefix}_e2e_customer`
    const fullCacheKey = `${TEST_NAMESPACE}:${customerId}`
    const dependencyKey = `customer:${customerId}`
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
        dependenciesFn: (id: string) => [`customer:${id}`],
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
    expect(storedValue).not.toBeNull()

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
    expect(await client.get(cacheKey1)).not.toBeNull()
    expect(await client.get(cacheKey2)).not.toBeNull()

    // Invalidate only sub1's ledger dependency
    await invalidateDependencies([dep1Key])

    // sub1's cache should be cleared, sub2's should remain
    expect(await client.get(cacheKey1)).toBeNull()
    expect(await client.get(cacheKey2)).not.toBeNull()

    // Now invalidate sub2's ledger dependency
    await invalidateDependencies([dep2Key])

    // Both should now be cleared
    expect(await client.get(cacheKey2)).toBeNull()
  })
})
