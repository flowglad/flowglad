/**
 * Billing Interval Dependencies
 *
 * Defines billing interval variants for behavior tests, representing
 * different subscription billing frequencies.
 *
 * ## Product Context
 *
 * Subscription billing intervals determine how often customers are charged:
 * - **Monthly**: Charged every month
 * - **Yearly**: Charged every year (often with discount)
 * - **Weekly**: Charged every week
 *
 * The billing interval affects proration calculations:
 * - Longer periods = larger proration amounts
 * - Shorter periods = more frequent adjustments
 *
 * ## Testing Strategy
 *
 * Tests run against different billing intervals to ensure:
 * - Proration math is correct for all intervals
 * - Period calculations work regardless of interval length
 * - No interval-specific bugs slip through
 */

import { IntervalUnit } from '@/types'
import { Dependency } from '../index'

/**
 * Configuration for a billing interval variant.
 */
interface BillingIntervalConfig {
  /** The interval unit (week, month, year) */
  intervalUnit: IntervalUnit
  /** The interval count (e.g., 1 for monthly, 3 for quarterly) */
  intervalCount: number
  /** Human-readable description */
  description: string
}

/**
 * BillingIntervalDep - Billing frequency for adjustment testing.
 *
 * This dependency creates test variants for different billing intervals,
 * ensuring proration calculations work correctly regardless of frequency.
 */
export abstract class BillingIntervalDep extends Dependency<BillingIntervalConfig>() {
  abstract intervalUnit: IntervalUnit
  abstract intervalCount: number
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Monthly Billing
 *
 * Standard monthly subscription billing.
 * Most common interval for SaaS subscriptions.
 */
BillingIntervalDep.implement('monthly', {
  intervalUnit: IntervalUnit.Month,
  intervalCount: 1,
  description: 'Monthly billing',
})

/**
 * Yearly Billing
 *
 * Annual subscription billing.
 * Often used with discounts for longer commitment.
 */
BillingIntervalDep.implement('yearly', {
  intervalUnit: IntervalUnit.Year,
  intervalCount: 1,
  description: 'Yearly billing',
})

/**
 * Weekly Billing
 *
 * Weekly subscription billing.
 * Less common, but useful for short-term or high-frequency products.
 */
BillingIntervalDep.implement('weekly', {
  intervalUnit: IntervalUnit.Week,
  intervalCount: 1,
  description: 'Weekly billing',
})
