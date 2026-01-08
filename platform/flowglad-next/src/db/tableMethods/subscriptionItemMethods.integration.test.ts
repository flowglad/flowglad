import { afterEach, beforeEach, expect, it } from 'vitest'
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
  cleanupRedisTestKeys,
  describeIfRedisKey,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import {
  CacheDependency,
  invalidateDependencies,
} from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import { selectSubscriptionItemsWithPricesBySubscriptionIdCached } from './subscriptionItemMethods'

/**
 * Integration tests for cached subscription item methods.
 *
 * These tests make real calls to Redis (Upstash) to verify:
 * 1. selectSubscriptionItemsWithPricesBySubscriptionIdCached correctly caches data
 * 2. Cache invalidation via CacheDependency.subscription works correctly
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
      const orgData = await setupOrg()
      organization = orgData.organization
      price = orgData.price

      customer = await setupCustomer({
        organizationId: organization.id,
      })

      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        name: 'Test Subscription Item',
        quantity: 1,
        unitPrice: 1000,
        priceId: price.id,
      })

      // Track cache keys for cleanup
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}`
      const dependencyKey = CacheDependency.subscription(
        subscription.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup = [cacheKey, registryKey]
    })

    afterEach(async () => {
      const client = getRedisTestClient()
      await cleanupRedisTestKeys(client, keysToCleanup)
    })

    it('selectSubscriptionItemsWithPricesBySubscriptionIdCached populates cache, returns cached result on subsequent calls, and registers subscription dependency', async () => {
      const client = getRedisTestClient()
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}`
      const dependencyKey = CacheDependency.subscription(
        subscription.id
      )
      const registryKey = `cacheDeps:${dependencyKey}`

      await adminTransaction(async ({ transaction }) => {
        // First call - should populate cache
        const result1 =
          await selectSubscriptionItemsWithPricesBySubscriptionIdCached(
            subscription.id,
            transaction
          )

        // Verify correct data returned
        expect(result1.length).toBe(1)
        expect(result1[0].subscriptionItem.id).toBe(
          subscriptionItem.id
        )
        expect(result1[0].price?.id).toBe(price.id)

        // Verify the value is stored in Redis
        const storedValue = await client.get(cacheKey)
        expect(storedValue).not.toBeNull()

        // Verify the dependency registry contains our cache key
        const registeredKeys = await client.smembers(registryKey)
        expect(registeredKeys).toContain(cacheKey)

        // Second call - should return cached result
        const result2 =
          await selectSubscriptionItemsWithPricesBySubscriptionIdCached(
            subscription.id,
            transaction
          )

        expect(result2.length).toBe(1)
        expect(result2[0].subscriptionItem.id).toBe(
          result1[0].subscriptionItem.id
        )
      })
    })

    it('cache returns fresh data after invalidateDependencies is called with subscription dependency', async () => {
      const client = getRedisTestClient()
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}`

      await adminTransaction(async ({ transaction }) => {
        // First call - populate cache with 1 item
        const result1 =
          await selectSubscriptionItemsWithPricesBySubscriptionIdCached(
            subscription.id,
            transaction
          )
        expect(result1.length).toBe(1)

        // Verify cache is populated
        const cachedBefore = await client.get(cacheKey)
        expect(cachedBefore).not.toBeNull()

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
          CacheDependency.subscription(subscription.id),
        ])

        // Verify cache entry was deleted
        const cachedAfter = await client.get(cacheKey)
        expect(cachedAfter).toBeNull()

        // Next call should fetch fresh data with 2 items
        const result2 =
          await selectSubscriptionItemsWithPricesBySubscriptionIdCached(
            subscription.id,
            transaction
          )
        expect(result2.length).toBe(2)
      })
    })

    it('cache returns empty array for non-existent subscription', async () => {
      const nonExistentId = 'sub_nonexistent_12345'
      const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${nonExistentId}`
      const dependencyKey =
        CacheDependency.subscription(nonExistentId)
      const registryKey = `cacheDeps:${dependencyKey}`
      keysToCleanup.push(cacheKey, registryKey)

      await adminTransaction(async ({ transaction }) => {
        const result =
          await selectSubscriptionItemsWithPricesBySubscriptionIdCached(
            nonExistentId,
            transaction
          )
        expect(result).toEqual([])
      })
    })
  }
)
