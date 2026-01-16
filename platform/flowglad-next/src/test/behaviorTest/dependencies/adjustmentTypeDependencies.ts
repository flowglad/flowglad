/**
 * Adjustment Type Dependencies
 *
 * Defines price change direction variants for behavior tests, representing
 * upgrade, downgrade, and lateral (same price) adjustments.
 *
 * ## Product Context
 *
 * Subscription adjustments can change the price in three ways:
 * - **Upgrade**: New plan costs more (net charge > 0)
 * - **Downgrade**: New plan costs less (net charge < 0)
 * - **Lateral**: Same total price (e.g., feature swap)
 *
 * The adjustment type affects:
 * - Auto timing determination (upgrades immediate, downgrades at period end)
 * - Proration calculations
 * - Billing run creation
 *
 * ## Testing Strategy
 *
 * Tests run against all adjustment types to ensure:
 * - Auto timing resolves correctly for each type
 * - Proration calculations are accurate
 * - isUpgrade flag is set correctly
 */

import { SubscriptionAdjustmentTiming } from '@/types'
import { Dependency } from '../index'

/**
 * Configuration for an adjustment type variant.
 */
interface AdjustmentTypeConfig {
  /**
   * Price multiplier to determine the new plan's total.
   * - > 1: Upgrade
   * - < 1: Downgrade
   * - = 1: Lateral move
   */
  priceMultiplier: number
  /** Whether this adjustment is considered an upgrade */
  isUpgrade: boolean
  /** Expected auto timing for this adjustment type */
  expectedAutoTiming:
    | typeof SubscriptionAdjustmentTiming.Immediately
    | typeof SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  /** Human-readable description */
  description: string
}

/**
 * AdjustmentTypeDep - Price change direction for adjustment testing.
 *
 * This dependency creates test variants for different adjustment directions,
 * each with a price multiplier that determines the new plan's relative cost.
 */
export abstract class AdjustmentTypeDep extends Dependency<AdjustmentTypeConfig>() {
  abstract priceMultiplier: number
  abstract isUpgrade: boolean
  abstract expectedAutoTiming:
    | typeof SubscriptionAdjustmentTiming.Immediately
    | typeof SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Upgrade Adjustment
 *
 * New plan costs 2x the original - a clear upgrade.
 * Auto timing: Immediately (customer wants features now)
 */
AdjustmentTypeDep.implement('upgrade', {
  priceMultiplier: 2.0,
  isUpgrade: true,
  expectedAutoTiming: SubscriptionAdjustmentTiming.Immediately,
  description: 'Upgrade (2x price)',
})

/**
 * Downgrade Adjustment
 *
 * New plan costs 0.5x the original - a downgrade.
 * Auto timing: AtEndOfCurrentBillingPeriod (customer gets value until period ends)
 */
AdjustmentTypeDep.implement('downgrade', {
  priceMultiplier: 0.5,
  isUpgrade: false,
  expectedAutoTiming:
    SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
  description: 'Downgrade (0.5x price)',
})

/**
 * Lateral Adjustment
 *
 * New plan costs the same as the original - a lateral move.
 * Auto timing: Immediately (no financial impact)
 */
AdjustmentTypeDep.implement('lateral', {
  priceMultiplier: 1.0,
  isUpgrade: false,
  expectedAutoTiming: SubscriptionAdjustmentTiming.Immediately,
  description: 'Lateral move (same price)',
})
