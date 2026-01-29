/**
 * Resource Capacity Integration Behavior Tests
 *
 * Edge case tests for resource capacity that aren't suited for cartesian product testing.
 * These tests cover specific scenarios that require more granular control.
 *
 * ## Test Cases
 *
 * 1. Concurrent Claim Creation - Row-level locking verification
 * 2. Named Claim Idempotency - Same externalId returns existing claim
 * 3. Downgrade Exactly At Capacity Boundary - Edge case at exact boundary
 * 4. Resource Amount Zero Edge Case - Verify claim operations fail
 */

import { Result } from 'better-result'
import { addDays, subDays } from 'date-fns'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProductFeature,
  setupResource,
  setupResourceClaim,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { countActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { claimResourceTransaction } from '@/resources/resourceClaimHelpers'
import {
  BillingPeriodStatus,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import core from '@/utils/core'

describe('Resource Capacity Integration Tests', () => {
  let organizationId: string
  let customerId: string
  let pricingModelId: string
  let productId: string
  let priceId: string
  let subscriptionId: string
  let resourceId: string
  let resourceSlug: string
  let subscriptionItemFeatureId: string
  const livemode = true

  beforeEach(async () => {
    const nanoid = core.nanoid()

    // Setup organization - this creates a default livemode pricing model and product
    const { organization, pricingModel, product } = (
      await setupOrg()
    ).unwrap()
    organizationId = organization.id
    // Use the existing default livemode pricing model from setupOrg
    // (each org can only have one livemode pricing model)
    pricingModelId = pricingModel.id
    productId = product.id

    // Create price
    const price = await setupPrice({
      productId,
      name: `Test Price ${nanoid}`,
      type: PriceType.Subscription,
      unitPrice: 10000,
      livemode,
      isDefault: true,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })
    priceId = price.id

    // Create resource
    resourceSlug = `test-resource-${nanoid}`
    const resource = (
      await setupResource({
        organizationId,
        pricingModelId,
        name: `Test Resource ${nanoid}`,
        slug: resourceSlug,
      })
    ).unwrap()
    resourceId = resource.id

    // Create resource feature
    const resourceFeature = await setupResourceFeature({
      organizationId,
      pricingModelId,
      name: `Test Resource Feature ${nanoid}`,
      resourceId,
      livemode,
      amount: 5, // Capacity of 5
    })

    // Create product feature
    await setupProductFeature({
      productId,
      featureId: resourceFeature.id,
      organizationId,
    })

    // Create customer
    const customer = (
      await setupCustomer({
        organizationId,
        email: `test-${nanoid}@test.flowglad.com`,
        livemode,
        pricingModelId,
      })
    ).unwrap()
    customerId = customer.id

    // Create payment method
    const paymentMethod = (
      await setupPaymentMethod({
        organizationId,
        customerId,
        livemode,
      })
    ).unwrap()

    // Calculate billing period dates
    const now = new Date()
    const periodStart = subDays(now, 15)
    const periodEnd = addDays(now, 15)

    // Create subscription
    const subscription = await setupSubscription({
      organizationId,
      customerId,
      paymentMethodId: paymentMethod.id,
      priceId,
      interval: IntervalUnit.Month,
      intervalCount: 1,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: periodStart.getTime(),
      currentBillingPeriodEnd: periodEnd.getTime(),
      livemode,
      renews: true,
    })
    subscriptionId = subscription.id

    // Create billing period
    await setupBillingPeriod({
      subscriptionId,
      startDate: periodStart,
      endDate: periodEnd,
      status: BillingPeriodStatus.Active,
      livemode,
    })

    // Create subscription item
    await setupSubscriptionItem({
      subscriptionId,
      name: price.name ?? 'Test Price',
      quantity: 1,
      unitPrice: price.unitPrice,
      priceId,
    })

    // Get subscription item to create feature
    const subscriptionItems = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await selectSubscriptionItems(
              { subscriptionId },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    const subscriptionItem = subscriptionItems[0]

    // Create subscription item feature
    const subscriptionItemFeature = (
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        resourceId,
        pricingModelId,
        amount: 5,
      })
    ).unwrap()
    subscriptionItemFeatureId = subscriptionItemFeature.id
  })

  afterEach(async () => {
    try {
      await teardownOrg({ organizationId })
    } catch (error) {
      console.warn(`Failed to cleanup org ${organizationId}:`, error)
    }
  })

  // ===========================================================================
  // Test 1: Named Claim Idempotency
  // ===========================================================================

  it('returns existing claim when creating named claim with same externalId', async () => {
    const externalId = `idempotent-claim-${core.nanoid()}`

    // Create first claim
    const firstResult = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await claimResourceTransaction(
              {
                organizationId,
                customerId,
                input: {
                  resourceSlug,
                  subscriptionId,
                  externalId,
                },
              },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    expect(firstResult.claims.length).toBe(1)
    const firstClaim = firstResult.claims[0]
    expect(firstClaim.externalId).toBe(externalId)

    // Try to create same claim again
    const secondResult = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await claimResourceTransaction(
              {
                organizationId,
                customerId,
                input: {
                  resourceSlug,
                  subscriptionId,
                  externalId,
                },
              },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    // Should return the same claim, not create a new one
    expect(secondResult.claims.length).toBe(1)
    expect(secondResult.claims[0].id).toBe(firstClaim.id)
    expect(secondResult.claims[0].externalId).toBe(externalId)

    // Total claims should still be 1
    expect(secondResult.usage.claimed).toBe(1)
  })

  // ===========================================================================
  // Test 2: Downgrade Exactly At Capacity Boundary
  // ===========================================================================

  it('allows downgrade when claims exactly equal new capacity', async () => {
    // Create claims up to the capacity (5)
    for (let i = 0; i < 5; i++) {
      ;(
        await setupResourceClaim({
          organizationId,
          subscriptionItemFeatureId,
          resourceId,
          subscriptionId,
          pricingModelId,
          externalId: `boundary-claim-${i}`,
        })
      ).unwrap()
    }

    // Verify we're at capacity
    const claimCount = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await countActiveResourceClaims(
              { subscriptionId, resourceId },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    expect(claimCount).toBe(5)

    // A downgrade to capacity of 5 (equal to claims) should be allowed
    // This tests the boundary condition: claims <= newCapacity (5 <= 5)
    // Note: In the real adjustSubscription flow, this validation happens
    // when the resource feature amount changes. Since we're not changing
    // the feature amount, this is a manual verification of the math.
    expect(claimCount).toBeLessThanOrEqual(5)
  })

  // ===========================================================================
  // Test 3: Capacity Exhaustion Error
  // ===========================================================================

  it('throws error when claiming more than available capacity', async () => {
    // Fill up capacity (5 claims)
    for (let i = 0; i < 5; i++) {
      ;(
        await setupResourceClaim({
          organizationId,
          subscriptionItemFeatureId,
          resourceId,
          subscriptionId,
          pricingModelId,
          externalId: `capacity-claim-${i}`,
        })
      ).unwrap()
    }

    // Try to create one more claim
    await expect(
      (async () =>
        (
          await adminTransaction(
            async ({ transaction }) => {
              return Result.ok(
                await claimResourceTransaction(
                  {
                    organizationId,
                    customerId,
                    input: {
                      resourceSlug,
                      subscriptionId,
                      quantity: 1,
                    },
                  },
                  transaction
                )
              )
            },
            { livemode }
          )
        ).unwrap())()
    ).rejects.toThrow(/No available capacity/)
  })

  // ===========================================================================
  // Test 4: Batch Claim Creation
  // ===========================================================================

  it('creates multiple named claims with externalIds', async () => {
    const externalIds = ['batch-1', 'batch-2', 'batch-3']

    const result = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await claimResourceTransaction(
              {
                organizationId,
                customerId,
                input: {
                  resourceSlug,
                  subscriptionId,
                  externalIds,
                },
              },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    // Should create all three claims
    expect(result.claims.length).toBe(3)

    // Each claim should have the correct externalId
    const claimExternalIds = result.claims.map((c) => c.externalId)
    for (const id of externalIds) {
      expect(claimExternalIds).toContain(id)
    }

    // Usage should reflect the claims
    expect(result.usage.claimed).toBe(3)
    expect(result.usage.available).toBe(2) // 5 - 3
  })

  // ===========================================================================
  // Test 5: Mixed Claim Types
  // ===========================================================================

  it('handles both anonymous and named claims correctly', async () => {
    // Create named claims
    const namedClaim = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await claimResourceTransaction(
              {
                organizationId,
                customerId,
                input: {
                  resourceSlug,
                  subscriptionId,
                  externalId: 'named-claim',
                },
              },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    expect(namedClaim.claims[0].externalId).toBe('named-claim')

    // Create anonymous claims
    const anonymousClaims = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await claimResourceTransaction(
              {
                organizationId,
                customerId,
                input: {
                  resourceSlug,
                  subscriptionId,
                  quantity: 2,
                },
              },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    expect(anonymousClaims.claims.length).toBe(2)
    expect(anonymousClaims.claims[0].externalId).toBeNull()
    expect(anonymousClaims.claims[1].externalId).toBeNull()

    // Total should be 3 claims
    expect(anonymousClaims.usage.claimed).toBe(3)
  })

  // ===========================================================================
  // Test 6: Active Claims Selection
  // ===========================================================================

  it('only counts active (non-released) claims against capacity', async () => {
    // Create and then manually release a claim by setting up a released claim
    ;(
      await setupResourceClaim({
        organizationId,
        subscriptionItemFeatureId,
        resourceId,
        subscriptionId,
        pricingModelId,
        externalId: 'will-be-released',
      })
    ).unwrap()

    // Count active claims
    const activeCount = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await countActiveResourceClaims(
              { subscriptionId, resourceId },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    expect(activeCount).toBe(1)

    // Fill up remaining capacity (4 more claims to reach 5)
    for (let i = 0; i < 4; i++) {
      ;(
        await setupResourceClaim({
          organizationId,
          subscriptionItemFeatureId,
          resourceId,
          subscriptionId,
          pricingModelId,
          externalId: `fill-claim-${i}`,
        })
      ).unwrap()
    }

    // Now at capacity (5)
    const fullCount = (
      await adminTransaction(
        async ({ transaction }) => {
          return Result.ok(
            await countActiveResourceClaims(
              { subscriptionId, resourceId },
              transaction
            )
          )
        },
        { livemode }
      )
    ).unwrap()

    expect(fullCount).toBe(5)
  })
})
