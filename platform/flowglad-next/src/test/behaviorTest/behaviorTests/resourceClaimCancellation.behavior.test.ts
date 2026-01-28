/**
 * Resource Claim Cancellation Behavior Tests
 *
 * Tests the resource claim lifecycle during subscription cancellation.
 * When a subscription is canceled, all active resource claims should be
 * automatically released with the reason 'subscription_canceled'.
 *
 * ## Chain
 *
 * 1. authenticateUserBehavior - User signs in
 * 2. createOrganizationBehavior - User creates their business account
 * 3. completeStripeOnboardingBehavior - Stripe account is connected
 * 4. setupSubscriptionBehavior - Creates subscription with resource feature
 * 5. createResourceClaimsBehavior - Creates claims based on dependency
 * 6. cancelSubscriptionWithResourcesBehavior - Cancels subscription
 *
 * ## Key Invariants
 *
 * - All claims released on cancellation
 * - Release reason is 'subscription_canceled'
 * - Claim count becomes 0 after cancellation
 * - Subscription status is 'Canceled'
 */

import { expect } from 'vitest'
import { SubscriptionStatus } from '@/types'
import { teardownOrg } from '../../../../seedDatabase'
import { authenticateUserBehavior } from '../behaviors/authBehaviors'
import { createOrganizationBehavior } from '../behaviors/orgSetupBehaviors'
import {
  type CancelSubscriptionWithResourcesResult,
  cancelSubscriptionWithResourcesBehavior,
  createResourceClaimsBehavior,
} from '../behaviors/resourceClaimBehaviors'
import { completeStripeOnboardingBehavior } from '../behaviors/stripeOnboardingBehaviors'
import { setupSubscriptionBehavior } from '../behaviors/subscriptionAdjustmentBehaviors'
import { PaymentSimulationDep } from '../dependencies/paymentSimulationDependencies'
import { ResourceClaimStateDep } from '../dependencies/resourceClaimStateDependencies'
import { ResourceFeatureDep } from '../dependencies/resourceFeatureDependencies'
import { SubscriptionStatusDep } from '../dependencies/subscriptionStatusDependencies'
import { behaviorTest } from '../index'

// =============================================================================
// Shared teardown function
// =============================================================================

const resourceClaimCancellationTeardown = async (
  results: unknown[]
) => {
  for (const result of results as CancelSubscriptionWithResourcesResult[]) {
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
// Tests that resource claims are properly released when subscription is canceled.
// All claims should be released regardless of claim state.
// =============================================================================

behaviorTest({
  only: [
    // Cancellation with no claims - baseline
    {
      ResourceFeatureDep: 'present',
      ResourceClaimStateDep: 'no-claims',
      SubscriptionStatusDep: 'active',
      PaymentSimulationDep: 'paid',
    },
    // Cancellation with partial claims
    {
      ResourceFeatureDep: 'present',
      ResourceClaimStateDep: 'partial-claims',
      SubscriptionStatusDep: 'active',
      PaymentSimulationDep: 'paid',
    },
    // Cancellation at capacity
    {
      ResourceFeatureDep: 'present',
      ResourceClaimStateDep: 'at-capacity',
      SubscriptionStatusDep: 'active',
      PaymentSimulationDep: 'paid',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result, getDep) => {
        const resourceFeatureDep = getDep(ResourceFeatureDep)

        // Resource feature should be present
        if (resourceFeatureDep.hasFeature) {
          expect(typeof result.features.resource?.id).toBe('string')
          expect(typeof result.features.resourceFeature?.id).toBe(
            'string'
          )
        }
      },
    },
    {
      behavior: createResourceClaimsBehavior,
      invariants: async (result, getDep) => {
        const resourceClaimStateDep = getDep(ResourceClaimStateDep)

        // Verify claims match expected occupancy
        const expectedClaimCount = Math.floor(
          result.capacity * resourceClaimStateDep.claimOccupancy
        )
        expect(result.claimedCount).toBe(expectedClaimCount)
      },
    },
    {
      behavior: cancelSubscriptionWithResourcesBehavior,
      invariants: async (result, getDep) => {
        const resourceClaimStateDep = getDep(ResourceClaimStateDep)

        // 1. Subscription should be canceled
        expect(result.canceledSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )

        // 2. All claims should be released
        // (claims after cancellation should be empty or all released)
        expect(result.claimsAfterCancellation.length).toBe(0)

        // 3. Released count should match initial claims
        const expectedClaimCount = Math.floor(
          result.capacity * resourceClaimStateDep.claimOccupancy
        )
        expect(result.releasedClaimCount).toBe(expectedClaimCount)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: resourceClaimCancellationTeardown,
})

// =============================================================================
// Subscription Status Variants Test
//
// Tests that claims are released correctly for different subscription statuses.
// Claims should be released regardless of whether the subscription is
// Active, Trialing, or PastDue.
// =============================================================================

behaviorTest({
  only: [
    // Active subscription cancellation
    {
      ResourceFeatureDep: 'present',
      ResourceClaimStateDep: 'at-capacity',
      SubscriptionStatusDep: 'active',
      PaymentSimulationDep: 'paid',
    },
    // Trialing subscription cancellation
    {
      ResourceFeatureDep: 'present',
      ResourceClaimStateDep: 'at-capacity',
      SubscriptionStatusDep: 'trialing',
      PaymentSimulationDep: 'paid',
    },
    // PastDue subscription cancellation
    {
      ResourceFeatureDep: 'present',
      ResourceClaimStateDep: 'at-capacity',
      SubscriptionStatusDep: 'past-due',
      PaymentSimulationDep: 'paid',
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
        expect(result.subscription.status).toBe(
          subscriptionStatusDep.status
        )
      },
    },
    {
      behavior: createResourceClaimsBehavior,
      invariants: async (result) => {
        // At capacity - all claims created
        expect(result.availableCapacity).toBe(0)
      },
    },
    {
      behavior: cancelSubscriptionWithResourcesBehavior,
      invariants: async (result) => {
        // Subscription should be canceled regardless of previous status
        expect(result.canceledSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )

        // All claims released
        expect(result.claimsAfterCancellation.length).toBe(0)
        expect(result.releasedClaimCount).toBe(result.claimedCount)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: resourceClaimCancellationTeardown,
})

// =============================================================================
// No Resource Feature Test
//
// Tests that cancellation works correctly when there's no resource feature.
// This is a baseline test to ensure cancellation doesn't break when there
// are no resource claims to release.
// =============================================================================

behaviorTest({
  only: [
    {
      ResourceFeatureDep: 'not-present',
      ResourceClaimStateDep: 'no-claims',
      SubscriptionStatusDep: 'active',
      PaymentSimulationDep: 'paid',
    },
  ],
  chain: [
    { behavior: authenticateUserBehavior },
    { behavior: createOrganizationBehavior },
    { behavior: completeStripeOnboardingBehavior },
    {
      behavior: setupSubscriptionBehavior,
      invariants: async (result, getDep) => {
        const resourceFeatureDep = getDep(ResourceFeatureDep)

        // No resource feature
        if (!resourceFeatureDep.hasFeature) {
          expect(result.features.resource).toBeNull()
          expect(result.features.resourceFeature).toBeNull()
        }
      },
    },
    {
      behavior: createResourceClaimsBehavior,
      invariants: async (result) => {
        // No claims when no resource feature
        expect(result.resourceClaims.length).toBe(0)
        expect(result.capacity).toBe(0)
      },
    },
    {
      behavior: cancelSubscriptionWithResourcesBehavior,
      invariants: async (result) => {
        // Cancellation should still succeed
        expect(result.canceledSubscription.status).toBe(
          SubscriptionStatus.Canceled
        )

        // No claims to release
        expect(result.releasedClaimCount).toBe(0)
      },
    },
  ],
  testOptions: { timeout: 120000 },
  teardown: resourceClaimCancellationTeardown,
})
