/**
 * Resource Feature Dependencies
 *
 * Defines resource (capacity) feature presence variants for behavior tests,
 * representing whether a subscription has resource features attached.
 *
 * ## Product Context
 *
 * Resource features represent claimable capacity - items that customers can
 * "check out" and hold exclusively. Examples:
 * - Team seats
 * - Project slots
 * - Device licenses
 *
 * Resource features have special validation during adjustments:
 * - Downgrades must validate that active claims don't exceed new capacity
 * - New SubscriptionItemFeatures are created with capacity amounts
 *
 * ## Testing Strategy
 *
 * Tests run against subscriptions with and without resource features to ensure:
 * - Capacity validation works correctly during downgrades
 * - Resources are properly created for new items
 * - No resource-related bugs slip through
 */

import { Dependency } from '../index'

/**
 * Configuration for a resource feature variant.
 */
interface ResourceFeatureConfig {
  /** Whether the subscription has resource features */
  hasFeature: boolean
  /** Human-readable description */
  description: string
}

/**
 * ResourceFeatureDep - Resource feature presence for adjustment testing.
 *
 * This dependency creates test variants for subscriptions with and without
 * resource features, ensuring adjustments handle capacity correctly.
 */
export abstract class ResourceFeatureDep extends Dependency<ResourceFeatureConfig>() {
  abstract hasFeature: boolean
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Resource Feature Present
 *
 * Subscription has resource features that need handling during adjustment.
 */
ResourceFeatureDep.implement('present', {
  hasFeature: true,
  description: 'Has resource features',
})

/**
 * No Resource Feature
 *
 * Subscription has no resource features - baseline case.
 */
ResourceFeatureDep.implement('not-present', {
  hasFeature: false,
  description: 'No resource features',
})
