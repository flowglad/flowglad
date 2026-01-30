/**
 * Adjustment Timing Dependencies
 *
 * Defines timing variants for behavior tests, representing when a
 * subscription adjustment takes effect.
 *
 * ## Product Context
 *
 * Subscription adjustments can be applied at different times:
 * - **Immediately**: Changes take effect right now
 * - **AtEndOfCurrentBillingPeriod**: Changes take effect at period end
 * - **Auto**: System determines best timing based on adjustment type
 *
 * ## Auto Timing Logic
 *
 * When timing is 'auto', the system automatically determines timing:
 * - Upgrades (net charge > 0): Applied immediately with proration
 * - Downgrades (net charge < 0): Applied at end of billing period
 * - Same price: Applied immediately (no financial impact)
 *
 * ## Testing Strategy
 *
 * Tests run against all timing options to ensure:
 * - Immediate adjustments are processed correctly
 * - End-of-period adjustments schedule correctly
 * - Auto timing resolves to expected values
 */

import { SubscriptionAdjustmentTiming } from '@/types'
import { Dependency } from '../index'

/**
 * Configuration for an adjustment timing variant.
 */
interface AdjustmentTimingConfig {
  /** The requested timing for the adjustment */
  timing: SubscriptionAdjustmentTiming
  /** Human-readable description */
  description: string
}

/**
 * AdjustmentTimingDep - When the adjustment takes effect.
 *
 * This dependency creates test variants for different timing options,
 * ensuring adjustments work correctly regardless of when they're applied.
 */
export abstract class AdjustmentTimingDep extends Dependency<AdjustmentTimingConfig>() {
  abstract timing: SubscriptionAdjustmentTiming
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Immediate Timing
 *
 * Adjustment takes effect immediately.
 * Proration is calculated for the remaining billing period.
 */
AdjustmentTimingDep.implement('immediately', {
  timing: SubscriptionAdjustmentTiming.Immediately,
  description: 'Immediate adjustment',
})

/**
 * End of Period Timing
 *
 * Adjustment takes effect at the end of the current billing period.
 * No proration - new pricing starts with next period.
 */
AdjustmentTimingDep.implement('end-of-period', {
  timing: SubscriptionAdjustmentTiming.AtEndOfCurrentBillingPeriod,
  description: 'End of billing period adjustment',
})

/**
 * Auto Timing
 *
 * System determines timing based on adjustment type:
 * - Upgrades: Immediately
 * - Downgrades: End of period
 * - Same price: Immediately
 */
AdjustmentTimingDep.implement('auto', {
  timing: SubscriptionAdjustmentTiming.Auto,
  description: 'Auto-determined timing',
})
