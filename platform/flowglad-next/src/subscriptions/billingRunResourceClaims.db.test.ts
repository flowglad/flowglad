import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupPrice,
  setupProduct,
  setupResource,
  setupResourceClaim,
  setupResourceFeature,
  setupResourceSubscriptionItemFeature,
  setupSubscription,
  setupSubscriptionItem,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Resource } from '@/db/schema/resources'
import type { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { selectActiveResourceClaims } from '@/db/tableMethods/resourceClaimMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  claimResourceTransaction,
  getResourceUsage,
  releaseResourceTransaction,
} from '@/resources/resourceClaimHelpers'
import {
  createMockConfirmationResult,
  createMockPaymentIntentResponse,
} from '@/test/helpers/stripeMocks'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  IntervalUnit,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
} from '@/types'
import { executeBillingRun } from './billingRunHelpers'

// Use global mocks from bun.db.mocks.ts
const mockCreatePaymentIntentForBillingRun =
  globalThis.__mockCreatePaymentIntentForBillingRun
const mockConfirmPaymentIntentForBillingRun =
  globalThis.__mockConfirmPaymentIntentForBillingRun

describe('executeBillingRun with adjustment and resource claims', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let upgradedPrice: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let subscriptionItem: SubscriptionItem.Record
  let billingPeriod: BillingPeriod.Record
  let billingRun: BillingRun.Record
  let resource: Resource.Record
  let resourceFeature: Feature.ResourceRecord
  let subscriptionItemFeature: SubscriptionItemFeature.Record

  beforeEach(async () => {
    // Reset mocks
    mockCreatePaymentIntentForBillingRun.mockReset()
    mockConfirmPaymentIntentForBillingRun.mockReset()

    // Setup organization and pricing model
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    price = orgData.price

    // Create a higher-priced tier for upgrades
    upgradedPrice = await setupPrice({
      productId: product.id,
      name: 'Premium Plan',
      unitPrice: 2000, // Higher price for upgrade
      livemode: true,
      isDefault: false,
      type: PriceType.Subscription,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    // Setup resource
    resource = await setupResource({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      slug: 'seats',
      name: 'Seats',
    })

    // Setup resource feature with 5 capacity
    resourceFeature = await setupResourceFeature({
      organizationId: organization.id,
      name: 'Seats Feature',
      resourceId: resource.id,
      livemode: true,
      pricingModelId: pricingModel.id,
      amount: 5,
    })

    // Setup customer and payment method
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

    // Setup subscription with active billing period
    const now = Date.now()
    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      paymentMethodId: paymentMethod.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: now - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      currentBillingPeriodEnd: now + 15 * 24 * 60 * 60 * 1000, // 15 days from now
    })

    // Setup subscription item
    subscriptionItem = await setupSubscriptionItem({
      subscriptionId: subscription.id,
      priceId: price.id,
      name: price.name ?? 'Basic Plan',
      quantity: 1,
      unitPrice: price.unitPrice,
      type: SubscriptionItemType.Static,
    })

    // Setup resource subscription item feature
    subscriptionItemFeature =
      await setupResourceSubscriptionItemFeature({
        subscriptionItemId: subscriptionItem.id,
        featureId: resourceFeature.id,
        resourceId: resource.id,
        pricingModelId: pricingModel.id,
        amount: 5,
      })

    // Setup billing period
    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      status: BillingPeriodStatus.Active,
    })

    // Setup billing period item
    await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: price.unitPrice,
      name: price.name ?? 'Basic Plan',
      type: SubscriptionItemType.Static,
      description: 'Monthly subscription',
    })

    // Setup adjustment billing run
    billingRun = await setupBillingRun({
      billingPeriodId: billingPeriod.id,
      paymentMethodId: paymentMethod.id,
      subscriptionId: subscription.id,
      status: BillingRunStatus.Scheduled,
      isAdjustment: true,
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  it('handleSubscriptionItemAdjustment creates new features without orphaning claims, and claims remain accessible via (subscriptionId, resourceId)', async () => {
    // Setup: Create 3 active claims
    for (let i = 0; i < 3; i++) {
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: `user-${i}`,
      })
    }

    // Verify initial claims
    const initialClaims = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(initialClaims.length).toBe(3)

    // Setup mock payment intent for successful payment
    const mockPaymentIntentId = `pi_${Date.now()}`
    const mockPaymentIntent = createMockPaymentIntentResponse({
      id: mockPaymentIntentId,
      amount: 1000,
      status: 'requires_confirmation',
    })
    mockCreatePaymentIntentForBillingRun.mockResolvedValue(
      Result.ok(mockPaymentIntent)
    )

    const mockConfirmationResult = createMockConfirmationResult(
      mockPaymentIntentId,
      { status: 'succeeded' }
    )
    mockConfirmPaymentIntentForBillingRun.mockResolvedValue(
      mockConfirmationResult
    )

    // Execute billing run with adjustment
    const newSubscriptionItems: SubscriptionItem.Insert[] = [
      {
        subscriptionId: subscription.id,
        priceId: upgradedPrice.id,
        name: upgradedPrice.name ?? 'Premium Plan',
        quantity: 1,
        unitPrice: upgradedPrice.unitPrice,
        type: SubscriptionItemType.Static,
        livemode: true,
        metadata: null,
        externalId: null,
        addedDate: Date.now(),
      },
    ]

    await executeBillingRun(billingRun.id, {
      newSubscriptionItems,
      adjustmentDate: new Date(),
    })

    // Assert: All 3 claims still exist and are accessible via (subscriptionId, resourceId)
    const claimsAfterAdjustment = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(claimsAfterAdjustment.length).toBe(3)
    expect(
      claimsAfterAdjustment.map((c) => c.externalId).sort()
    ).toEqual(['user-0', 'user-1', 'user-2'].sort())

    // Assert: getResourceUsage returns correct aggregated capacity from new features
    // Note: The new subscription item should have its own resource feature created
    const usage = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        )
      })
    ).unwrap()
    expect(usage.claimed).toBe(3)
    expect(usage.available).toBeGreaterThanOrEqual(0)
  })

  it('claims remain accessible when billing run is created but not yet executed', async () => {
    // Setup: Create 3 active claims
    for (let i = 0; i < 3; i++) {
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: `claim-${i}`,
      })
    }

    // Billing run is created (in Scheduled status) but not executed yet
    const currentBillingRun = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          (
            await selectBillingRunById(billingRun.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
    expect(currentBillingRun.status).toBe(BillingRunStatus.Scheduled)
    expect(currentBillingRun.isAdjustment).toBe(true)

    // Assert: Claims still accessible (old features still active)
    const claims = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(claims.length).toBe(3)

    // Assert: Can still release claims
    const releaseResult = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await releaseResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalId: 'claim-0',
              },
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(releaseResult.releasedClaims.length).toBe(1)
    expect(releaseResult.releasedClaims[0].externalId).toBe('claim-0')

    // Assert: Cannot claim beyond current capacity
    const usage = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        )
      })
    ).unwrap()
    expect(usage.capacity).toBe(5) // Original capacity
    expect(usage.claimed).toBe(2) // 3 - 1 released
    expect(usage.available).toBe(3) // 5 - 2

    // Attempting to claim more than available should fail
    await expect(
      adminTransaction(async ({ transaction }) => {
        const result = await claimResourceTransaction(
          {
            organizationId: organization.id,
            customerId: customer.id,
            input: {
              resourceSlug: 'seats',
              subscriptionId: subscription.id,
              quantity: 4, // More than available (3)
            },
          },
          transaction
        )
        return Result.ok(result)
      })
    ).rejects.toThrow('No available capacity')
  })

  it('preserves claims through the full async adjustment lifecycle', async () => {
    // Setup: Create 2 claims
    for (let i = 0; i < 2; i++) {
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: `existing-user-${i}`,
      })
    }

    // Phase 1: Before adjustment - verify initial state
    let usage = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        )
      })
    ).unwrap()
    expect(usage.capacity).toBe(5)
    expect(usage.claimed).toBe(2)
    expect(usage.available).toBe(3)

    // Phase 2: Execute billing run (payment succeeds)
    const mockPaymentIntentId = `pi_lifecycle_${Date.now()}`
    const mockPaymentIntent = createMockPaymentIntentResponse({
      id: mockPaymentIntentId,
      amount: 500, // Proration amount
      status: 'requires_confirmation',
    })
    mockCreatePaymentIntentForBillingRun.mockResolvedValue(
      Result.ok(mockPaymentIntent)
    )

    const mockConfirmationResult = createMockConfirmationResult(
      mockPaymentIntentId,
      { status: 'succeeded' }
    )
    mockConfirmPaymentIntentForBillingRun.mockResolvedValue(
      mockConfirmationResult
    )

    const newSubscriptionItems: SubscriptionItem.Insert[] = [
      {
        subscriptionId: subscription.id,
        priceId: upgradedPrice.id,
        name: upgradedPrice.name ?? 'Premium Plan',
        quantity: 1,
        unitPrice: upgradedPrice.unitPrice,
        type: SubscriptionItemType.Static,
        livemode: true,
        metadata: null,
        externalId: null,
        addedDate: Date.now(),
      },
    ]

    await executeBillingRun(billingRun.id, {
      newSubscriptionItems,
      adjustmentDate: new Date(),
    })

    // Phase 3: After adjustment - claims accessible, verify new capacity
    usage = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        )
      })
    ).unwrap()
    expect(usage.claimed).toBe(2) // Original claims still exist
    expect(usage.available).toBeGreaterThanOrEqual(0)

    // All original claims should still be accessible
    const claimsAfterAdjustment = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(claimsAfterAdjustment.length).toBe(2)
    expect(
      claimsAfterAdjustment.map((c) => c.externalId).sort()
    ).toEqual(['existing-user-0', 'existing-user-1'].sort())

    // Phase 4: Claim more resources (up to new capacity if available)
    // Create 2 more claims
    const newClaimResult = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await claimResourceTransaction(
            {
              organizationId: organization.id,
              customerId: customer.id,
              input: {
                resourceSlug: 'seats',
                subscriptionId: subscription.id,
                externalIds: ['new-user-0', 'new-user-1'],
              },
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(newClaimResult.claims.length).toBe(2)

    // Phase 5: All claims (old and new) should be visible
    const allClaims = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(allClaims.length).toBe(4) // 2 original + 2 new
    expect(allClaims.map((c) => c.externalId).sort()).toEqual([
      'existing-user-0',
      'existing-user-1',
      'new-user-0',
      'new-user-1',
    ])

    // Verify final usage
    usage = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        )
      })
    ).unwrap()
    expect(usage.claimed).toBe(4)
  })

  it('does not modify claims when billing run fails due to payment decline', async () => {
    // Setup: Create 3 active claims
    for (let i = 0; i < 3; i++) {
      await setupResourceClaim({
        organizationId: organization.id,
        resourceId: resource.id,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: `preserved-user-${i}`,
      })
    }

    // Capture initial state
    const initialSubscriptionItems = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectCurrentlyActiveSubscriptionItems(
            { subscriptionId: subscription.id },
            new Date(),
            transaction
          )
        )
      })
    ).unwrap()

    // Setup mock payment intent for FAILED payment
    const mockPaymentIntentId = `pi_failed_${Date.now()}`
    const mockPaymentIntent = createMockPaymentIntentResponse({
      id: mockPaymentIntentId,
      amount: 1000,
      status: 'requires_confirmation',
    })
    mockCreatePaymentIntentForBillingRun.mockResolvedValue(
      Result.ok(mockPaymentIntent)
    )

    // Payment fails
    const mockFailedResult = createMockConfirmationResult(
      mockPaymentIntentId,
      { status: 'requires_payment_method' } // This indicates payment failed
    )
    mockConfirmPaymentIntentForBillingRun.mockResolvedValue(
      mockFailedResult
    )

    const newSubscriptionItems: SubscriptionItem.Insert[] = [
      {
        subscriptionId: subscription.id,
        priceId: upgradedPrice.id,
        name: upgradedPrice.name ?? 'Premium Plan',
        quantity: 1,
        unitPrice: upgradedPrice.unitPrice,
        type: SubscriptionItemType.Static,
        livemode: true,
        metadata: null,
        externalId: null,
        addedDate: Date.now(),
      },
    ]

    // Execute billing run - payment will fail
    await executeBillingRun(billingRun.id, {
      newSubscriptionItems,
      adjustmentDate: new Date(),
    })

    // Assert: Billing run should be marked as failed
    const updatedBillingRun = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          (
            await selectBillingRunById(billingRun.id, transaction)
          ).unwrap()
        )
      })
    ).unwrap()
    expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)

    // Assert: Subscription items NOT adjusted (processOutcomeForBillingRun early exits for failed adjustment)
    const subscriptionItemsAfterFailure = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectCurrentlyActiveSubscriptionItems(
            { subscriptionId: subscription.id },
            new Date(),
            transaction
          )
        )
      })
    ).unwrap()
    expect(subscriptionItemsAfterFailure.length).toBe(
      initialSubscriptionItems.length
    )
    expect(subscriptionItemsAfterFailure[0].id).toBe(
      initialSubscriptionItems[0].id
    )

    // Assert: All 3 claims still accessible
    const claimsAfterFailure = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectActiveResourceClaims(
            {
              subscriptionId: subscription.id,
              resourceId: resource.id,
            },
            transaction
          )
        )
      })
    ).unwrap()
    expect(claimsAfterFailure.length).toBe(3)
    expect(
      claimsAfterFailure.map((c) => c.externalId).sort()
    ).toEqual([
      'preserved-user-0',
      'preserved-user-1',
      'preserved-user-2',
    ])

    // Assert: Capacity unchanged (still from old features)
    const usage = (
      await adminTransaction(async ({ transaction }) => {
        return Result.ok(
          await getResourceUsage(
            subscription.id,
            resource.id,
            transaction
          )
        )
      })
    ).unwrap()
    expect(usage.capacity).toBe(5) // Original capacity
    expect(usage.claimed).toBe(3)
    expect(usage.available).toBe(2)
  })
})
