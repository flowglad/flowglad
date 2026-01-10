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
