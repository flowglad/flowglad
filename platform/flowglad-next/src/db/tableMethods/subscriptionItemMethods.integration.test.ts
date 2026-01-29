import { afterEach, beforeEach, expect, it } from 'bun:test'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  selectSubscriptionItemsWithPricesBySubscriptionId,
  selectSubscriptionItemsWithPricesBySubscriptionIds,
} from '@/db/tableMethods/subscriptionItemMethods.server'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import { CacheDependency } from '@/utils/cache'
import { invalidateDependencies } from '@/utils/cache.internal'
import { RedisKeyNamespace } from '@/utils/redis'

/**
 * Integration tests for cached subscription item methods.
 *
 * These tests make real calls to Redis (Upstash) to verify:
 * 1. selectSubscriptionItemsWithPricesBySubscriptionId correctly caches data
 * 2. Cache invalidation via CacheDependency.subscriptionItems works correctly
 *
 * These tests require UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 * environment variables to be set.
 */

describeIfRedisKey(
  'Subscription Item Methods Cache Integration Tests',
  () => {
    let organization: Organization.Record
    let price: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: Subscription.Record
    let subscriptionItem: SubscriptionItem.Record
    let keysToCleanup: string[] = []

    beforeEach(async () => {
      const orgData = (await setupOrg()).unwrap()
      organization = orgData.organization
      price = orgData.price

      customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()

      paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })

      subscriptionItem = (
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'Test Subscription Item',
          quantity: 1,
          unitPrice: 1000,
          priceId: price.id,
        })
      ).unwrap()

      // Track cache keys for cleanup (livemode is true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:true`
      const dependencyKey = CacheDependency.subscriptionItems(
        subscription.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup = [cacheKey, registryKey]
    })

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
    })

    it('selectSubscriptionItemsWithPricesBySubscriptionId populates cache, returns cached result on subsequent calls, and registers subscription dependency', async () => {
      const client = getRedisTestClient()
      // Cache key includes livemode (true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:true`
      const dependencyKey = CacheDependency.subscriptionItems(
        subscription.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`

      await adminTransaction(async ({ transaction, livemode }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode,
        }

        // First call - should populate cache
        const result1 =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            subscription.id,
            transaction,
            cacheRecomputationContext
          )

        // Verify correct data returned
        expect(result1.length).toBe(1)
        expect(result1[0].subscriptionItem.id).toBe(
          subscriptionItem.id
        )
        expect(result1[0].price?.id).toBe(price.id)

        // Verify the value is stored in Redis and has expected structure
        const storedValue = await client.get(cacheKey)
        expect(Array.isArray(storedValue)).toBe(true)
        const storedArray = storedValue as Array<{
          subscriptionItem: { id: string }
          price: { id: string } | null
        }>
        expect(storedArray.length).toBe(1)
        expect(storedArray[0].subscriptionItem.id).toBe(
          subscriptionItem.id
        )

        // Verify the dependency registry contains our cache key
        const registeredKeys = await client.smembers(registryKey)
        expect(registeredKeys).toContain(cacheKey)

        // Second call - should return cached result
        const result2 =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            subscription.id,
            transaction,
            cacheRecomputationContext
          )

        expect(result2.length).toBe(1)
        expect(result2[0].subscriptionItem.id).toBe(
          result1[0].subscriptionItem.id
        )
      })
    })

    it('cache returns fresh data after invalidateDependencies is called with subscription dependency', async () => {
      const client = getRedisTestClient()
      // Cache key includes livemode (true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:true`

      await adminTransaction(async ({ transaction, livemode }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode,
        }

        // First call - populate cache with 1 item
        const result1 =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            subscription.id,
            transaction,
            cacheRecomputationContext
          )
        expect(result1.length).toBe(1)

        // Verify cache is populated with expected structure
        const cachedBefore = await client.get(cacheKey)
        expect(Array.isArray(cachedBefore)).toBe(true)
        expect((cachedBefore as unknown[]).length).toBe(1)

        // Add a new subscription item (outside the cache)
        await setupSubscriptionItem({
          subscriptionId: subscription.id,
          name: 'New Item After Cache',
          quantity: 2,
          unitPrice: 2000,
          priceId: price.id,
        })

        // Invalidate the subscription dependency
        await invalidateDependencies([
          CacheDependency.subscriptionItems(subscription.id),
        ])

        // Verify cache entry was deleted
        const cachedAfter = await client.get(cacheKey)
        expect(cachedAfter).toBeNull()

        // Next call should fetch fresh data with 2 items
        const result2 =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            subscription.id,
            transaction,
            cacheRecomputationContext
          )
        expect(result2.length).toBe(2)
      })
    })

    it('cache returns empty array for non-existent subscription', async () => {
      const nonExistentId = 'sub_nonexistent_12345'
      // Cache key includes livemode (true by default in admin transactions)
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${nonExistentId}:true`
      const dependencyKey =
        CacheDependency.subscriptionItems(nonExistentId)
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      await adminTransaction(async ({ transaction, livemode }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode,
        }
        const result =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            nonExistentId,
            transaction,
            cacheRecomputationContext
          )
        expect(result).toEqual([])
      })
    })
  }
)

describeIfRedisKey(
  'selectSubscriptionItemsWithPricesBySubscriptionIds Integration Tests',
  () => {
    let organization: Organization.Record
    let price: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription1: Subscription.Record
    let subscription2: Subscription.Record
    let subscriptionItem1: SubscriptionItem.Record
    let subscriptionItem2: SubscriptionItem.Record
    let keysToCleanup: string[] = []

    beforeEach(async () => {
      const orgData = (await setupOrg()).unwrap()
      organization = orgData.organization
      price = orgData.price

      customer = (
        await setupCustomer({
          organizationId: organization.id,
        })
      ).unwrap()

      paymentMethod = (
        await setupPaymentMethod({
          organizationId: organization.id,
          customerId: customer.id,
        })
      ).unwrap()

      subscription1 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })

      subscription2 = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })

      subscriptionItem1 = (
        await setupSubscriptionItem({
          subscriptionId: subscription1.id,
          name: 'Item for Subscription 1',
          quantity: 1,
          unitPrice: 1000,
          priceId: price.id,
        })
      ).unwrap()

      subscriptionItem2 = (
        await setupSubscriptionItem({
          subscriptionId: subscription2.id,
          name: 'Item for Subscription 2',
          quantity: 2,
          unitPrice: 2000,
          priceId: price.id,
        })
      ).unwrap()

      // Track cache keys for cleanup
      const cacheKey1 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription1.id}:true`
      const cacheKey2 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription2.id}:true`
      const dep1Key = CacheDependency.subscriptionItems(
        subscription1.id
      )
      const dep2Key = CacheDependency.subscriptionItems(
        subscription2.id
      )
      keysToCleanup = [
        cacheKey1,
        cacheKey2,
        `cacheDeps:${dep1Key}`,
        `cacheDeps:${dep2Key}`,
      ]
    })

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
    })

    it('fetches items for multiple subscriptions in a single bulk call and caches each separately', async () => {
      const client = getRedisTestClient()
      const cacheKey1 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription1.id}:true`
      const cacheKey2 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription2.id}:true`

      await adminTransaction(async ({ transaction, livemode }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [subscription1.id, subscription2.id],
            transaction,
            livemode
          )

        // Should return items for both subscriptions (flattened)
        expect(results.length).toBe(2)
        const ids = results.map((r) => r.subscriptionItem.id)
        expect(ids).toContain(subscriptionItem1.id)
        expect(ids).toContain(subscriptionItem2.id)
      })

      // Verify both subscriptions are cached separately
      const cached1 = await client.get(cacheKey1)
      const cached2 = await client.get(cacheKey2)
      expect(Array.isArray(cached1)).toBe(true)
      expect(Array.isArray(cached2)).toBe(true)
      expect((cached1 as unknown[]).length).toBe(1)
      expect((cached2 as unknown[]).length).toBe(1)
    })

    it('returns cached results for cache hits and fetches only misses', async () => {
      const client = getRedisTestClient()
      const cacheKey1 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription1.id}:true`

      // Pre-populate cache for subscription1 using the single function
      await adminTransaction(async ({ transaction, livemode }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode,
        }
        await selectSubscriptionItemsWithPricesBySubscriptionId(
          subscription1.id,
          transaction,
          cacheRecomputationContext
        )
      })

      // Verify subscription1 is cached
      const cached1Before = await client.get(cacheKey1)
      expect(Array.isArray(cached1Before)).toBe(true)

      // Now call bulk function for both - subscription1 should be a cache hit
      await adminTransaction(async ({ transaction, livemode }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [subscription1.id, subscription2.id],
            transaction,
            livemode
          )

        expect(results.length).toBe(2)
        const ids = results.map((r) => r.subscriptionItem.id)
        expect(ids).toContain(subscriptionItem1.id)
        expect(ids).toContain(subscriptionItem2.id)
      })
    })

    it('returns empty array when given empty subscription IDs array', async () => {
      await adminTransaction(async ({ transaction, livemode }) => {
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [],
            transaction,
            livemode
          )

        expect(results).toEqual([])
      })
    })

    it('respects cache invalidation for individual subscriptions', async () => {
      const client = getRedisTestClient()
      const cacheKey1 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription1.id}:true`
      const cacheKey2 = `${RedisKeyNamespace.ItemsBySubscription}:${subscription2.id}:true`

      await adminTransaction(async ({ transaction, livemode }) => {
        // Populate cache for both subscriptions
        await selectSubscriptionItemsWithPricesBySubscriptionIds(
          [subscription1.id, subscription2.id],
          transaction,
          livemode
        )

        // Verify both are cached
        const cached1Before = await client.get(cacheKey1)
        const cached2Before = await client.get(cacheKey2)
        expect(Array.isArray(cached1Before)).toBe(true)
        expect(Array.isArray(cached2Before)).toBe(true)

        // Add item to subscription1
        await setupSubscriptionItem({
          subscriptionId: subscription1.id,
          name: 'New Item for Subscription 1',
          quantity: 3,
          unitPrice: 3000,
          priceId: price.id,
        })

        // Invalidate only subscription1's cache
        await invalidateDependencies([
          CacheDependency.subscriptionItems(subscription1.id),
        ])

        // Verify subscription1 cache is cleared but subscription2 is still cached
        const cached1After = await client.get(cacheKey1)
        const cached2After = await client.get(cacheKey2)
        expect(cached1After).toBeNull()
        expect(Array.isArray(cached2After)).toBe(true)

        // Bulk fetch again - should get fresh data for subscription1 (2 items)
        // and cached data for subscription2 (1 item)
        const results =
          await selectSubscriptionItemsWithPricesBySubscriptionIds(
            [subscription1.id, subscription2.id],
            transaction,
            livemode
          )

        // subscription1 now has 2 items, subscription2 has 1 item
        expect(results.length).toBe(3)
        const sub1Items = results.filter(
          (r) =>
            r.subscriptionItem.subscriptionId === subscription1.id
        )
        const sub2Items = results.filter(
          (r) =>
            r.subscriptionItem.subscriptionId === subscription2.id
        )
        expect(sub1Items.length).toBe(2)
        expect(sub2Items.length).toBe(1)
      })
    })
  }
)
