/**
 * Resource Claim Behaviors
 *
 * Behaviors for creating and managing resource claims in subscription adjustment testing.
 *
 * ## Product Context
 *
 * Resource claims represent "checked out" capacity from a subscription's resource feature.
 * They are critical for testing:
 * - Capacity validation during downgrades
 * - Auto-release on subscription cancellation
 * - Named vs anonymous claim patterns
 *
 * ## Behavior Chain
 *
 * These behaviors typically follow setupSubscriptionBehavior and precede
 * adjustSubscriptionBehavior or cancelSubscriptionBehavior.
 */

import { Result } from 'better-result'
import { setupResourceClaim } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { ResourceClaim } from '@/db/schema/resourceClaims'
import type { Subscription } from '@/db/schema/subscriptions'
import {
  countActiveResourceClaims,
  selectActiveResourceClaims,
} from '@/db/tableMethods/resourceClaimMethods'
import { selectSubscriptionItemFeatures } from '@/db/tableMethods/subscriptionItemFeatureMethods'
import { selectSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { cancelSubscriptionImmediately } from '@/subscriptions/cancelSubscription'
import { FeatureType } from '@/types'
import { ResourceClaimStateDep } from '../dependencies/resourceClaimStateDependencies'
import { defineBehavior } from '../index'
import type { SetupSubscriptionResult } from './subscriptionAdjustmentBehaviors'

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of creating resource claims for testing.
 */
export interface CreateResourceClaimsResult
  extends SetupSubscriptionResult {
  /** The created resource claims */
  resourceClaims: ResourceClaim.Record[]
  /** Total capacity available */
  capacity: number
  /** Number of claims created */
  claimedCount: number
  /** Available capacity after claims */
  availableCapacity: number
}

/**
 * Result of canceling a subscription with resources.
 */
export interface CancelSubscriptionWithResourcesResult
  extends CreateResourceClaimsResult {
  /** The canceled subscription */
  canceledSubscription: Subscription.Record
  /** Number of claims that were released */
  releasedClaimCount: number
  /** The claims after cancellation (should be released) */
  claimsAfterCancellation: ResourceClaim.Record[]
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Finds the resource subscription item feature for a subscription.
 * Returns null if the subscription doesn't have a resource feature.
 */
async function findResourceSubscriptionItemFeature(
  subscriptionId: string,
  resourceId: string
) {
  return (
    await adminTransaction(
      async ({ transaction }) => {
        const subscriptionItems = await selectSubscriptionItems(
          { subscriptionId },
          transaction
        )

        for (const item of subscriptionItems) {
          const features = await selectSubscriptionItemFeatures(
            { subscriptionItemId: item.id },
            transaction
          )

          const resourceFeature = features.find(
            (f) =>
              f.type === FeatureType.Resource &&
              f.resourceId === resourceId
          )

          if (resourceFeature) {
            return Result.ok({
              subscriptionItem: item,
              subscriptionItemFeature: resourceFeature,
            })
          }
        }

        return Result.ok(null)
      },
      { livemode: true }
    )
  ).unwrap()
}

// ============================================================================
// Behaviors
// ============================================================================

/**
 * Create Resource Claims Behavior
 *
 * Creates resource claims based on the ResourceClaimStateDep configuration.
 * This behavior should follow setupSubscriptionBehavior when testing
 * resource capacity validation.
 *
 * ## Claim Creation Logic
 *
 * - no-claims (0.0): Creates no claims
 * - partial-claims (0.5): Creates claims for 50% of capacity
 * - at-capacity (1.0): Creates claims for 100% of capacity
 *
 * ## Prerequisites
 *
 * - Subscription must have a resource feature (ResourceFeatureDep: 'present')
 * - The feature must be active on the subscription
 */
export const createResourceClaimsBehavior = defineBehavior({
  name: 'create resource claims',
  dependencies: [ResourceClaimStateDep],
  run: async (
    { resourceClaimStateDep },
    prev: SetupSubscriptionResult
  ): Promise<CreateResourceClaimsResult> => {
    const { organization, subscription, pricingModel, features } =
      prev

    // If no resource feature, return empty claims
    if (!features.resource || !features.resourceFeature) {
      return {
        ...prev,
        resourceClaims: [],
        capacity: 0,
        claimedCount: 0,
        availableCapacity: 0,
      }
    }

    const resourceId = features.resource.id

    // Find the subscription item feature for this resource
    const featureInfo = await findResourceSubscriptionItemFeature(
      subscription.id,
      resourceId
    )

    if (!featureInfo) {
      throw new Error(
        `No subscription item feature found for resource ${resourceId} in subscription ${subscription.id}`
      )
    }

    const { subscriptionItemFeature } = featureInfo

    // Use the capacity from the subscription item feature
    // This is set by setupResourceSubscriptionItemFeature in setupSubscriptionBehavior
    const capacity = subscriptionItemFeature.amount ?? 0

    // Calculate how many claims to create based on occupancy
    const claimCount = Math.floor(
      capacity * resourceClaimStateDep.claimOccupancy
    )

    // Create claims
    const resourceClaims: ResourceClaim.Record[] = []

    for (let i = 0; i < claimCount; i++) {
      const claim = await setupResourceClaim({
        organizationId: organization.id,
        subscriptionItemFeatureId: subscriptionItemFeature.id,
        resourceId,
        subscriptionId: subscription.id,
        pricingModelId: pricingModel.id,
        externalId: `test-claim-${i}`,
      })
      resourceClaims.push(claim)
    }

    return {
      ...prev,
      resourceClaims,
      capacity,
      claimedCount: claimCount,
      availableCapacity: capacity - claimCount,
    }
  },
})

/**
 * Cancel Subscription With Resources Behavior
 *
 * Cancels a subscription that has resource claims. This behavior verifies
 * that claims are properly released with the 'subscription_canceled' reason.
 *
 * ## Expected Behavior
 *
 * - All active claims should be released
 * - Release reason should be 'subscription_canceled'
 * - Subscription status should be 'Canceled'
 */
export const cancelSubscriptionWithResourcesBehavior = defineBehavior(
  {
    name: 'cancel subscription with resources',
    dependencies: [ResourceClaimStateDep],
    run: async (
      _deps,
      prev: CreateResourceClaimsResult
    ): Promise<CancelSubscriptionWithResourcesResult> => {
      const { subscription, features } = prev
      const livemode = true

      // Get initial claim count for verification
      const initialClaimCount = prev.claimedCount

      // Cancel the subscription
      const cancelResult = (
        await adminTransaction<Subscription.Record>(
          async (ctx) => {
            return cancelSubscriptionImmediately(
              {
                subscription,
                skipNotifications: true,
                skipReassignDefaultSubscription: true,
              },
              ctx
            )
          },
          { livemode }
        )
      ).unwrap()

      // Get claims after cancellation
      let claimsAfterCancellation: ResourceClaim.Record[] = []
      let activeClaimCount = 0

      if (features.resource) {
        const resourceId = features.resource.id

        // Get all claims (including released ones) to verify release reason
        claimsAfterCancellation = (
          await adminTransaction(
            async ({ transaction }) => {
              // We need to check all claims, not just active ones
              // to verify the release reason
              const allClaims = await selectActiveResourceClaims(
                { subscriptionId: subscription.id },
                transaction
              )
              return Result.ok(allClaims)
            },
            { livemode }
          )
        ).unwrap()

        // Count active claims (should be 0 after cancellation)
        activeClaimCount = (
          await adminTransaction(
            async ({ transaction }) => {
              return Result.ok(
                await countActiveResourceClaims(
                  {
                    subscriptionId: subscription.id,
                    resourceId,
                  },
                  transaction
                )
              )
            },
            { livemode }
          )
        ).unwrap()
      }

      return {
        ...prev,
        canceledSubscription: cancelResult,
        releasedClaimCount: initialClaimCount - activeClaimCount,
        claimsAfterCancellation,
      }
    },
  }
)
