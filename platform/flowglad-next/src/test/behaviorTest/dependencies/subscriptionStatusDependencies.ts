/**
 * Subscription Status Dependencies
 *
 * Defines subscription status variants for behavior tests, representing
 * the different non-terminal states a subscription can be in when adjusted.
 *
 * ## Product Context
 *
 * Subscriptions can be in various states throughout their lifecycle:
 * - **Active**: Standard operational state
 * - **Trialing**: Time-based trial period
 * - **PastDue**: Payment failed, retrying
 *
 * Note: Terminal states (Canceled, Expired) cannot be adjusted and are
 * tested separately in integration tests.
 *
 * ## Testing Strategy
 *
 * Tests run against all adjustable subscription statuses to ensure:
 * - Adjustments work correctly regardless of status
 * - Status transitions are handled properly
 * - No status-specific bugs slip through
 */

import { SubscriptionStatus } from '@db-core/enums'
import { Dependency } from '../index'

/**
 * Configuration for a subscription status variant.
 */
interface SubscriptionStatusConfig {
  /** The subscription status */
  status: SubscriptionStatus
  /** Human-readable description of this status */
  description: string
}

/**
 * SubscriptionStatusDep - Subscription state for adjustment testing.
 *
 * This dependency creates test variants for different subscription states
 * that can be adjusted (non-terminal states).
 */
export abstract class SubscriptionStatusDep extends Dependency<SubscriptionStatusConfig>() {
  abstract status: SubscriptionStatus
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Active Subscription
 *
 * Standard active subscription - the most common state for adjustments.
 */
SubscriptionStatusDep.implement('active', {
  status: SubscriptionStatus.Active,
  description: 'Active subscription',
})

/**
 * Trialing Subscription
 *
 * Time-based trial subscription.
 * Note: Adjustments during trial should work normally.
 */
SubscriptionStatusDep.implement('trialing', {
  status: SubscriptionStatus.Trialing,
  description: 'Trialing subscription',
})

/**
 * Past Due Subscription
 *
 * Subscription with failed payment, currently retrying.
 * Adjustments should still be allowed to help resolve payment issues.
 */
SubscriptionStatusDep.implement('past-due', {
  status: SubscriptionStatus.PastDue,
  description: 'Past due subscription',
})
