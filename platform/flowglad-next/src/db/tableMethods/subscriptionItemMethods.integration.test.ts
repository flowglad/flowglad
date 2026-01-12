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
import { selectSubscriptionItemsWithPricesBySubscriptionId } from './subscriptionItemMethods'

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
        // First call - should populate cache
        const result1 =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            subscription.id,
            transaction,
            livemode
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
            livemode
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
        // First call - populate cache with 1 item
        const result1 =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            subscription.id,
            transaction,
            livemode
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
            livemode
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
        const result =
          await selectSubscriptionItemsWithPricesBySubscriptionId(
            nonExistentId,
            transaction,
            livemode
          )
        expect(result).toEqual([])
      })
    })
  }
)
