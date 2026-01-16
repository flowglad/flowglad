/**
 * Usage Credit Grant Feature Dependencies
 *
 * Defines usage credit grant feature presence variants for behavior tests,
 * representing whether a subscription has usage credit grant features attached.
 *
 * ## Product Context
 *
 * Usage credit grant features provide a pool of credits that customers can
 * consume during their billing period. Examples:
 * - API call credits
 * - Storage quota
 * - Processing minutes
 *
 * When a subscription is adjusted with usage credit grants:
 * - New credits may be prorated based on remaining period
 * - Old credits may be expired
 * - New SubscriptionItemFeatures are created
 *
 * ## Testing Strategy
 *
 * Tests run against subscriptions with and without usage credit grants to ensure:
 * - Credit proration is calculated correctly
 * - Credits are properly granted or expired
 * - No usage-related bugs slip through
 */

import { Dependency } from '../index'

/**
 * Configuration for a usage credit grant feature variant.
 */
interface UsageCreditGrantFeatureConfig {
  /** Whether the subscription has usage credit grant features */
  hasFeature: boolean
  /** Human-readable description */
  description: string
}

/**
 * UsageCreditGrantFeatureDep - Usage credit grant presence for adjustment testing.
 *
 * This dependency creates test variants for subscriptions with and without
 * usage credit grant features, ensuring adjustments handle credits correctly.
 */
export abstract class UsageCreditGrantFeatureDep extends Dependency<UsageCreditGrantFeatureConfig>() {
  abstract hasFeature: boolean
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Usage Credit Grant Feature Present
 *
 * Subscription has usage credit grant features that need handling during adjustment.
 */
UsageCreditGrantFeatureDep.implement('present', {
  hasFeature: true,
  description: 'Has usage credit grant features',
})

/**
 * No Usage Credit Grant Feature
 *
 * Subscription has no usage credit grant features - baseline case.
 */
UsageCreditGrantFeatureDep.implement('not-present', {
  hasFeature: false,
  description: 'No usage credit grant features',
})
