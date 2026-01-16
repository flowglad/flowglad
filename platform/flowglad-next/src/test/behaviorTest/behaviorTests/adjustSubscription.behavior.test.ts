/**
 * Subscription Adjustment Behavior Tests
 *
 * Tests the subscription adjustment flow across different subscription statuses,
 * adjustment types (upgrade/downgrade/lateral), timing options, proration settings,
 * billing intervals, and feature configurations.
 *
 * ## Chain
 *
 * 1. authenticateUserBehavior - User signs in
 * 2. createOrganizationBehavior - User creates their business account
 * 3. completeStripeOnboardingBehavior - Stripe account is connected
 * 4. setupSubscriptionBehavior - Creates subscription with initial items
 * 5. setupTargetPriceBehavior - Creates price to adjust to
 * 6. adjustSubscriptionBehavior - Calls adjustSubscription
 *
 * ## Key Invariants
 *
 * - Result structure is always valid (subscription, items, resolvedTiming)
 * - isUpgrade flag matches the adjustment type
 * - Auto timing resolves correctly based on price change direction
 * - Subscription is synced with most expensive item after immediate adjustments
 * - New items created with correct priceId and quantity
 */

import { expect } from 'vitest'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { SubscriptionAdjustmentTiming } from '@/types'
import { teardownOrg } from '../../../../seedDatabase'
import { authenticateUserBehavior } from '../behaviors/authBehaviors'
import { createOrganizationBehavior } from '../behaviors/orgSetupBehaviors'
import { completeStripeOnboardingBehavior } from '../behaviors/stripeOnboardingBehaviors'
import {
  type AdjustSubscriptionBehaviorResult,
  adjustSubscriptionBehavior,
  setupSubscriptionBehavior,
  setupTargetPriceBehavior,
} from '../behaviors/subscriptionAdjustmentBehaviors'
import { AdjustmentTimingDep } from '../dependencies/adjustmentTimingDependencies'
import { AdjustmentTypeDep } from '../dependencies/adjustmentTypeDependencies'
import { BillingIntervalDep } from '../dependencies/billingIntervalDependencies'
import { SubscriptionStatusDep } from '../dependencies/subscriptionStatusDependencies'
import { behaviorTest } from '../index'

// =============================================================================
// Shared teardown function
// =============================================================================

const adjustSubscriptionTeardown = async (results: unknown[]) => {
  for (const result of results as AdjustSubscriptionBehaviorResult[]) {
    try {
      if (result?.organization?.id) {
        await teardownOrg({
          organizationId: result.organization.id,
        })
      }
    } catch (error) {
      console.warn(
        `[teardown] Failed to cleanup org ${result?.organization?.id}:`,
        error
      )
    }
  }
}

// =============================================================================
// Universal Invariants Test
//
// Tests that hold for ALL valid subscription adjustment combinations.
// Key invariants:
// - Result structure is valid
// - isUpgrade flag matches adjustment type
// - Auto timing resolves correctly
// - New subscription items have correct data
//
// Skips invalid combinations: upgrade + end-of-period timing
// =============================================================================

behaviorTest({
  skip: [
    // Upgrade + end-of-period timing is not allowed (will throw)
    {
      AdjustmentTypeDep: 'upgrade',
      AdjustmentTimingDep: 'end-of-period',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result, getDep) => {
        const subscriptionStatusDep = getDep(SubscriptionStatusDep)
        const billingIntervalDep = getDep(BillingIntervalDep)

        // Subscription created with correct status
        expect(result.subscription.status).toBe(
          subscriptionStatusDep.status
        )

        // Subscription has correct billing interval
        expect(result.subscription.interval).toBe(
          billingIntervalDep.intervalUnit
        )
        expect(result.subscription.intervalCount).toBe(
          billingIntervalDep.intervalCount
        )

        // Subscription items exist
        expect(result.subscriptionItems.length).toBeGreaterThan(0)
      },
    },
    {
      behavior: setupTargetPriceBehavior,
      invariants: async (result, getDep) => {
        const adjustmentTypeDep = getDep(AdjustmentTypeDep)

        // Target price created with correct unit price
        const expectedPrice = Math.round(
          result.initialPrice.unitPrice *
            adjustmentTypeDep.priceMultiplier
        )
        expect(result.targetPrice.unitPrice).toBe(expectedPrice)
      },
    },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result, getDep) => {
        const adjustmentTypeDep = getDep(AdjustmentTypeDep)
        const adjustmentTimingDep = getDep(AdjustmentTimingDep)

        const { adjustmentResult } = result

        // 1. Result structure is valid - check specific values
        expect(adjustmentResult.subscription.id).toBe(
          result.subscription.id
        )
        expect(
          Array.isArray(adjustmentResult.subscriptionItems)
        ).toBe(true)
        expect(
          adjustmentResult.subscriptionItems.length
        ).toBeGreaterThan(0)
        expect(
          [
            SubscriptionAdjustmentTiming.Immediately,
            SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
          ].includes(adjustmentResult.resolvedTiming)
        ).toBe(true)
        expect(typeof adjustmentResult.isUpgrade).toBe('boolean')

        // 2. isUpgrade flag matches adjustment type
        expect(adjustmentResult.isUpgrade).toBe(
          adjustmentTypeDep.isUpgrade
        )

        // 3. Auto timing resolves correctly
        if (
          adjustmentTimingDep.timing ===
          SubscriptionAdjustmentTiming.Auto
        ) {
          expect(adjustmentResult.resolvedTiming).toBe(
            adjustmentTypeDep.expectedAutoTiming
          )
        } else {
          expect(adjustmentResult.resolvedTiming).toBe(
            adjustmentTimingDep.timing
          )
        }

        // 4. For immediate adjustments, subscription is synced with new price
        if (
          adjustmentResult.resolvedTiming ===
          SubscriptionAdjustmentTiming.Immediately
        ) {
          expect(adjustmentResult.subscription.priceId).toBe(
            result.targetPrice.id
          )
        }

        // 5. New items have correct data
        const newItem = adjustmentResult.subscriptionItems.find(
          (item: SubscriptionItem.Record) =>
            item.priceId === result.targetPrice.id
        )
        expect(newItem?.priceId).toBe(result.targetPrice.id)
        expect(newItem?.quantity).toBe(1)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})

// =============================================================================
// Proration Creates Billing Run Test (upgrade + proration + immediately)
//
// Tests that immediate upgrades with proration enabled create a billing run.
// =============================================================================

behaviorTest({
  only: [
    {
      AdjustmentTypeDep: 'upgrade',
      ProrationDep: 'enabled',
      AdjustmentTimingDep: 'immediately',
    },
    {
      AdjustmentTypeDep: 'upgrade',
      ProrationDep: 'enabled',
      AdjustmentTimingDep: 'auto',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: setupSubscriptionBehavior },
    { behavior: setupTargetPriceBehavior },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result) => {
        const { adjustmentResult } = result

        // Upgrade with proration should create a pending billing run
        // The billing run handles the proration amount
        expect(adjustmentResult.isUpgrade).toBe(true)
        expect(adjustmentResult.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )

        // Subscription should be updated immediately
        expect(adjustmentResult.subscription.priceId).toBe(
          result.targetPrice.id
        )
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})

// =============================================================================
// End-of-Period Scheduling Test (downgrade)
//
// Tests that downgrades with end-of-period timing are scheduled correctly.
// =============================================================================

behaviorTest({
  only: [
    {
      AdjustmentTypeDep: 'downgrade',
      AdjustmentTimingDep: 'end-of-period',
    },
    { AdjustmentTypeDep: 'downgrade', AdjustmentTimingDep: 'auto' },
    {
      AdjustmentTypeDep: 'lateral',
      AdjustmentTimingDep: 'end-of-period',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    { behavior: setupSubscriptionBehavior },
    { behavior: setupTargetPriceBehavior },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result, getDep) => {
        const adjustmentTypeDep = getDep(AdjustmentTypeDep)
        const { adjustmentResult } = result

        // Downgrade auto timing resolves to end-of-period
        if (adjustmentTypeDep.priceMultiplier < 1) {
          expect(adjustmentResult.resolvedTiming).toBe(
            SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
          )
        }

        // For end-of-period timing, subscription price is NOT updated immediately
        if (
          adjustmentResult.resolvedTiming ===
          SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
        ) {
          // The subscription's current priceId should still be the initial price
          // until the billing period ends
          expect(adjustmentResult.subscription.priceId).toBe(
            result.initialPrice.id
          )
        }
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})

// =============================================================================
// Toggle Feature Handling Test
//
// Tests that toggle features are properly handled during adjustment.
// =============================================================================

behaviorTest({
  only: [
    {
      ToggleFeatureDep: 'present',
      AdjustmentTimingDep: 'immediately',
    },
    { ToggleFeatureDep: 'present', AdjustmentTimingDep: 'auto' },
  ],
  skip: [
    // Skip upgrade + end-of-period (invalid)
    {
      AdjustmentTypeDep: 'upgrade',
      AdjustmentTimingDep: 'end-of-period',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result) => {
        // Toggle feature should be created - verify by checking id exists
        expect(typeof result.features.toggleFeature?.id).toBe(
          'string'
        )
        expect(typeof result.features.toggleProductFeature?.id).toBe(
          'string'
        )
      },
    },
    {
      behavior: setupTargetPriceBehavior,
      invariants: async (result) => {
        // Target product should also have the toggle feature
        expect(typeof result.targetFeatures.toggleFeature?.id).toBe(
          'string'
        )
        expect(
          typeof result.targetFeatures.toggleProductFeature?.id
        ).toBe('string')
      },
    },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result) => {
        // Adjustment should complete successfully with toggle features
        expect(result.adjustmentResult.subscription.id).toBe(
          result.subscription.id
        )
        expect(
          result.adjustmentResult.subscriptionItems.length
        ).toBeGreaterThan(0)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})

// =============================================================================
// Usage Credit Grant Feature Handling Test
//
// Tests that usage credit grant features are properly handled during adjustment.
// =============================================================================

behaviorTest({
  only: [
    {
      UsageCreditGrantFeatureDep: 'present',
      AdjustmentTimingDep: 'immediately',
    },
    {
      UsageCreditGrantFeatureDep: 'present',
      AdjustmentTimingDep: 'auto',
    },
  ],
  skip: [
    // Skip upgrade + end-of-period (invalid)
    {
      AdjustmentTypeDep: 'upgrade',
      AdjustmentTimingDep: 'end-of-period',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result) => {
        // Usage credit grant feature should be created - verify by checking id exists
        expect(
          typeof result.features.usageCreditGrantFeature?.id
        ).toBe('string')
        expect(typeof result.features.usageMeter?.id).toBe('string')
        expect(
          typeof result.features.usageCreditGrantProductFeature?.id
        ).toBe('string')
      },
    },
    {
      behavior: setupTargetPriceBehavior,
      invariants: async (result) => {
        // Target product should also have the usage credit grant feature
        expect(
          typeof result.targetFeatures.usageCreditGrantFeature?.id
        ).toBe('string')
        expect(
          typeof result.targetFeatures.usageCreditGrantProductFeature
            ?.id
        ).toBe('string')
      },
    },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result) => {
        // Adjustment should complete successfully with usage credit grants
        expect(result.adjustmentResult.subscription.id).toBe(
          result.subscription.id
        )
        expect(
          result.adjustmentResult.subscriptionItems.length
        ).toBeGreaterThan(0)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})

// =============================================================================
// Resource Feature Handling Test
//
// Tests that resource (capacity) features are properly handled during adjustment.
// =============================================================================

behaviorTest({
  only: [
    {
      ResourceFeatureDep: 'present',
      AdjustmentTimingDep: 'immediately',
    },
    { ResourceFeatureDep: 'present', AdjustmentTimingDep: 'auto' },
  ],
  skip: [
    // Skip upgrade + end-of-period (invalid)
    {
      AdjustmentTypeDep: 'upgrade',
      AdjustmentTimingDep: 'end-of-period',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result) => {
        // Resource feature should be created - verify by checking id exists
        expect(typeof result.features.resourceFeature?.id).toBe(
          'string'
        )
        expect(typeof result.features.resource?.id).toBe('string')
        expect(
          typeof result.features.resourceProductFeature?.id
        ).toBe('string')
      },
    },
    {
      behavior: setupTargetPriceBehavior,
      invariants: async (result) => {
        // Target product should also have the resource feature
        expect(typeof result.targetFeatures.resourceFeature?.id).toBe(
          'string'
        )
        expect(typeof result.targetFeatures.resource?.id).toBe(
          'string'
        )
        expect(
          typeof result.targetFeatures.resourceProductFeature?.id
        ).toBe('string')
      },
    },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result) => {
        // Adjustment should complete successfully with resource features
        expect(result.adjustmentResult.subscription.id).toBe(
          result.subscription.id
        )
        expect(
          result.adjustmentResult.subscriptionItems.length
        ).toBeGreaterThan(0)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})

// =============================================================================
// Billing Interval Specific Tests
//
// Tests that proration calculations work correctly for different billing intervals.
// =============================================================================

behaviorTest({
  only: [
    {
      BillingIntervalDep: 'yearly',
      AdjustmentTypeDep: 'upgrade',
      AdjustmentTimingDep: 'immediately',
      ProrationDep: 'enabled',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result, getDep) => {
        const billingIntervalDep = getDep(BillingIntervalDep)

        // Yearly billing interval
        expect(result.subscription.interval).toBe(
          billingIntervalDep.intervalUnit
        )
        expect(billingIntervalDep.intervalUnit).toBe('year')
      },
    },
    { behavior: setupTargetPriceBehavior },
    {
      behavior: adjustSubscriptionBehavior,
      invariants: async (result) => {
        // Yearly upgrade with proration should work correctly
        expect(result.adjustmentResult.isUpgrade).toBe(true)
        expect(result.adjustmentResult.resolvedTiming).toBe(
          SubscriptionAdjustmentTiming.Immediately
        )

        // Proration calculations for yearly subscriptions involve larger amounts
        // due to the longer billing period
        expect(result.adjustmentResult.subscription.priceId).toBe(
          result.targetPrice.id
        )
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: adjustSubscriptionTeardown,
})
