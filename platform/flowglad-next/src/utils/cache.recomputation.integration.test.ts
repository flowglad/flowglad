import { afterEach, expect, it } from 'vitest'
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupSubscription,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { updateSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionItemsWithPricesBySubscriptionId } from '@/db/tableMethods/subscriptionItemMethods.server'
import {
  cleanupRedisTestKeys,
  describeIfRedisKey,
  getRedisTestClient,
} from '@/test/redisIntegrationHelpers'
import {
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import {
  CacheDependency,
  invalidateDependencies,
  recomputeDependencies,
} from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'

/**
 * Integration tests for cache recomputation functionality.
 *
 * These tests verify the end-to-end flow of:
 * 1. Cache population with recomputation metadata
 * 2. Automatic recomputation after invalidation
 * 3. Livemode context preservation during recomputation
 * 4. Fire-and-forget behavior of recomputation
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.
 */

/**
 * Helper to safely parse a value that may already be an object (Upstash auto-parses JSON)
 * or may be a string that needs parsing. Throws if value is null/undefined.
 */
function safeParseJsonNonNull<T>(value: unknown): T {
  if (value === null || value === undefined) {
    throw new Error('Expected non-null value from cache')
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }
  return value as T
}

describeIfRedisKey('cache recomputation integration', () => {
  let keysToCleanup: string[] = []

  afterEach(async () => {
    const client = getRedisTestClient()
    await cleanupRedisTestKeys(client, keysToCleanup)
    keysToCleanup = []
  })

  it('end-to-end: invalidation triggers recomputation and cache contains fresh data', async () => {
    const client = getRedisTestClient()

    // Setup: Create customer, subscription, and subscription item
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
      name: 'E2E Recomputation Test Product',
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'E2E Recomputation Test Price',
      type: PriceType.Subscription,
      unitPrice: 5000,
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
    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: price.id,
      name: 'Test Subscription Item',
      quantity: 1,
      unitPrice: 5000,
    })

    // Track keys for cleanup
    const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:true`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    const dependencyKey = CacheDependency.subscriptionItems(
      subscription.id
    )
    const registryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:${dependencyKey}`
    keysToCleanup.push(cacheKey, metadataKey, registryKey)

    // Step 1: Populate cache by calling selectSubscriptionItemsWithPricesBySubscriptionId
    const initialResult = await adminTransaction(
      async ({ transaction }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode: true,
        }
        return selectSubscriptionItemsWithPricesBySubscriptionId(
          subscription.id,
          transaction,
          cacheRecomputationContext
        )
      }
    )

    expect(initialResult).toHaveLength(1)
    expect(initialResult[0].subscriptionItem.id).toBe(
      subscriptionItem.id
    )
    expect(initialResult[0].subscriptionItem.quantity).toBe(1)

    // Step 2: Verify cache is populated by reading and parsing the value
    const cachedValueBeforeUpdate = await client.get(cacheKey)
    const parsedCachedValue = safeParseJsonNonNull<
      Array<{ subscriptionItem: { id: string; quantity: number } }>
    >(cachedValueBeforeUpdate)
    expect(parsedCachedValue[0].subscriptionItem.id).toBe(
      subscriptionItem.id
    )

    const metadataBeforeUpdate = await client.get(metadataKey)
    const parsedMetadataBefore = safeParseJsonNonNull<{
      createdAt: number
    }>(metadataBeforeUpdate)
    expect(parsedMetadataBefore.createdAt).toBeGreaterThan(0)
    const createdAtBefore = parsedMetadataBefore.createdAt

    // Step 3: Update subscription item in database to simulate data change
    await adminTransaction(async ({ transaction }) => {
      await updateSubscriptionItem(
        {
          id: subscriptionItem.id,
          quantity: 5,
          type: SubscriptionItemType.Static,
        },
        transaction
      )
    })

    // Step 4: Invalidate cache and trigger recomputation
    await invalidateDependencies([dependencyKey])

    // Cache should be deleted immediately after invalidation
    const cachedValueAfterInvalidation = await client.get(cacheKey)
    expect(cachedValueAfterInvalidation).toBeNull()

    // Trigger recomputation (simulates what would happen in a production scenario)
    await recomputeDependencies([dependencyKey])

    // Step 5: Wait for fire-and-forget recomputation to complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Step 6: Verify cache contains updated subscription item data
    const cachedValueAfterRecompute = await client.get(cacheKey)
    const recomputedData = safeParseJsonNonNull<
      Array<{ subscriptionItem: { id: string; quantity: number } }>
    >(cachedValueAfterRecompute)
    expect(recomputedData).toHaveLength(1)
    expect(recomputedData[0].subscriptionItem.id).toBe(
      subscriptionItem.id
    )
    expect(recomputedData[0].subscriptionItem.quantity).toBe(5)

    // Step 7: Verify metadata key was recreated with updated timestamp
    const metadataAfterRecompute = await client.get(metadataKey)
    const parsedMetadataAfter = safeParseJsonNonNull<{
      namespace: string
      params: { subscriptionId: string; livemode: boolean }
      createdAt: number
    }>(metadataAfterRecompute)
    expect(parsedMetadataAfter.namespace).toBe(
      RedisKeyNamespace.ItemsBySubscription
    )
    expect(parsedMetadataAfter.params).toEqual({
      subscriptionId: subscription.id,
      livemode: true,
    })
    expect(parsedMetadataAfter.createdAt).toBeGreaterThan(
      createdAtBefore
    )
  })

  it('recomputation preserves livemode context', async () => {
    const client = getRedisTestClient()

    // Setup: Create subscription item in testmode (livemode=false)
    const { organization, pricingModel } = await setupOrg()
    const customer = await setupCustomer({
      organizationId: organization.id,
      livemode: false,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      livemode: false,
    })
    const product = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Livemode Context Test Product',
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Livemode Context Test Price',
      type: PriceType.Subscription,
      unitPrice: 2500,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: false,
      isDefault: false,
    })
    const subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      livemode: false,
    })
    const subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: price.id,
      name: 'Test Subscription Item (Testmode)',
      quantity: 1,
      unitPrice: 2500,
    })

    // Track keys for cleanup - note the :false suffix for testmode
    const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:false`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    const dependencyKey = CacheDependency.subscriptionItems(
      subscription.id
    )
    const registryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:${dependencyKey}`
    keysToCleanup.push(cacheKey, metadataKey, registryKey)

    // Populate cache with testmode (livemode=false) context
    await adminTransaction(
      async ({ transaction }) => {
        const cacheRecomputationContext = {
          type: 'admin' as const,
          livemode: false,
        }
        return selectSubscriptionItemsWithPricesBySubscriptionId(
          subscription.id,
          transaction,
          cacheRecomputationContext
        )
      },
      { livemode: false }
    )

    // Verify cache key includes :false for testmode and contains correct data
    const cachedValue = await client.get(cacheKey)
    const cachedData =
      safeParseJsonNonNull<
        Array<{ subscriptionItem: { id: string; livemode: boolean } }>
      >(cachedValue)
    expect(cachedData).toHaveLength(1)
    expect(cachedData[0].subscriptionItem.id).toBe(
      subscriptionItem.id
    )
    expect(cachedData[0].subscriptionItem.livemode).toBe(false)

    // Verify metadata stores livemode=false
    const metadataValue = await client.get(metadataKey)
    const metadata = safeParseJsonNonNull<{
      cacheRecomputationContext: { livemode: boolean }
      params: { livemode: boolean }
    }>(metadataValue)
    expect(metadata.cacheRecomputationContext.livemode).toBe(false)
    expect(metadata.params.livemode).toBe(false)

    // Invalidate and trigger recomputation
    await invalidateDependencies([dependencyKey])
    await recomputeDependencies([dependencyKey])

    // Wait for recomputation to complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify recomputation ran with livemode=false and cache key still includes :false
    const recomputedValue = await client.get(cacheKey)
    const recomputedData =
      safeParseJsonNonNull<
        Array<{ subscriptionItem: { livemode: boolean } }>
      >(recomputedValue)
    expect(recomputedData).toHaveLength(1)
    expect(recomputedData[0].subscriptionItem.livemode).toBe(false)

    // Verify metadata was recreated with same livemode context
    const recomputedMetadata = await client.get(metadataKey)
    const parsedRecomputedMetadata = safeParseJsonNonNull<{
      cacheRecomputationContext: { livemode: boolean }
      params: { livemode: boolean }
    }>(recomputedMetadata)
    expect(
      parsedRecomputedMetadata.cacheRecomputationContext.livemode
    ).toBe(false)
    expect(parsedRecomputedMetadata.params.livemode).toBe(false)
  })

  it('recomputation is fire-and-forget (does not block caller)', async () => {
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
      name: 'Fire and Forget Test Product',
    })
    const price = await setupPrice({
      productId: product.id,
      name: 'Fire and Forget Test Price',
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
      name: 'Fire and Forget Test Item',
      quantity: 1,
      unitPrice: 3000,
    })

    // Track keys for cleanup
    const cacheKey = `${RedisKeyNamespace.ItemsBySubscription}:${subscription.id}:true`
    const metadataKey = `${RedisKeyNamespace.CacheRecomputeMetadata}:${cacheKey}`
    const dependencyKey = CacheDependency.subscriptionItems(
      subscription.id
    )
    const registryKey = `${RedisKeyNamespace.CacheDependencyRegistry}:${dependencyKey}`
    keysToCleanup.push(cacheKey, metadataKey, registryKey)

    // Populate cache
    await adminTransaction(async ({ transaction }) => {
      const cacheRecomputationContext = {
        type: 'admin' as const,
        livemode: true,
      }
      return selectSubscriptionItemsWithPricesBySubscriptionId(
        subscription.id,
        transaction,
        cacheRecomputationContext
      )
    })

    // Invalidate cache
    await invalidateDependencies([dependencyKey])

    // Measure how long recomputeDependencies takes to return
    const startTime = Date.now()
    await recomputeDependencies([dependencyKey])
    const elapsedTime = Date.now() - startTime

    // recomputeDependencies should return relatively quickly even though
    // the actual recomputation involves database queries.
    // We use a generous threshold since timing can vary significantly in CI environments.
    // The key point is that recomputation happens asynchronously, not that it's instant.
    expect(elapsedTime).toBeLessThan(500)

    // Cache might not be populated yet because recomputation is async
    // But it should eventually be populated
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify cache was eventually repopulated by parsing the value
    const cachedValue = await client.get(cacheKey)
    const parsedValue =
      safeParseJsonNonNull<
        Array<{ subscriptionItem: { id: string } }>
      >(cachedValue)
    expect(parsedValue).toHaveLength(1)
  })
})
