/**
 * Proration Dependencies
 *
 * Defines proration configuration variants for behavior tests, representing
 * whether mid-period charges should be calculated and applied.
 *
 * ## Product Context
 *
 * When a subscription is adjusted mid-billing period, proration determines
 * whether the customer is charged immediately for the remaining period:
 *
 * - **Enabled (default)**: Customer is charged prorated amount for upgrade
 * - **Disabled**: No mid-period charge; new pricing starts on next renewal
 *
 * ## Proration Calculation
 *
 * When enabled, proration is calculated as:
 * - Fair value = (old plan * time used) + (new plan * time remaining)
 * - Net charge = Fair value - amount already paid
 * - Capped at 0 (no credits/refunds for downgrades)
 *
 * ## Testing Strategy
 *
 * Tests run against both proration settings to ensure:
 * - Proration creates billing runs when enabled
 * - No billing run created when disabled
 * - Subscription items are updated correctly in both cases
 */

import { Dependency } from '../index'

/**
 * Configuration for a proration variant.
 */
interface ProrationConfig {
  /** Whether to prorate mid-period charges */
  prorateCurrentBillingPeriod: boolean
  /** Human-readable description */
  description: string
}

/**
 * ProrationDep - Proration setting for adjustment testing.
 *
 * This dependency creates test variants for different proration settings,
 * ensuring adjustments work correctly with or without mid-period charges.
 */
export abstract class ProrationDep extends Dependency<ProrationConfig>() {
  abstract prorateCurrentBillingPeriod: boolean
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Proration Enabled (Default)
 *
 * Customer is charged prorated amount for upgrades mid-period.
 * This is the default behavior for immediate adjustments.
 */
ProrationDep.implement('enabled', {
  prorateCurrentBillingPeriod: true,
  description: 'Proration enabled',
})

/**
 * Proration Disabled
 *
 * No mid-period charge - new pricing applies immediately but
 * customer is not charged until next billing cycle.
 */
ProrationDep.implement('disabled', {
  prorateCurrentBillingPeriod: false,
  description: 'Proration disabled',
})
