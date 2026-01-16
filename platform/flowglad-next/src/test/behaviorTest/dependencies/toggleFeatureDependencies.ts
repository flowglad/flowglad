/**
 * Toggle Feature Dependencies
 *
 * Defines toggle feature presence variants for behavior tests, representing
 * whether a subscription has toggle features attached.
 *
 * ## Product Context
 *
 * Toggle features are binary capabilities (on/off) that are granted to
 * customers as part of their subscription. Examples:
 * - API access
 * - Premium support
 * - Advanced analytics
 *
 * When a subscription is adjusted, toggle features are handled by:
 * - Creating new SubscriptionItemFeatures for new items
 * - Expiring old SubscriptionItemFeatures for replaced items
 *
 * ## Testing Strategy
 *
 * Tests run against subscriptions with and without toggle features to ensure:
 * - Feature handling works correctly during adjustments
 * - Features are properly transferred or expired
 * - No feature-related bugs slip through
 */

import { Dependency } from '../index'

/**
 * Configuration for a toggle feature variant.
 */
interface ToggleFeatureConfig {
  /** Whether the subscription has toggle features */
  hasFeature: boolean
  /** Human-readable description */
  description: string
}

/**
 * ToggleFeatureDep - Toggle feature presence for adjustment testing.
 *
 * This dependency creates test variants for subscriptions with and without
 * toggle features, ensuring adjustments handle features correctly.
 */
export abstract class ToggleFeatureDep extends Dependency<ToggleFeatureConfig>() {
  abstract hasFeature: boolean
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Toggle Feature Present
 *
 * Subscription has toggle features that need to be handled during adjustment.
 */
ToggleFeatureDep.implement('present', {
  hasFeature: true,
  description: 'Has toggle features',
})

/**
 * No Toggle Feature
 *
 * Subscription has no toggle features - baseline case.
 */
ToggleFeatureDep.implement('not-present', {
  hasFeature: false,
  description: 'No toggle features',
})
