/**
 * Payment Simulation Dependencies
 *
 * Defines whether a payment should be simulated for the initial billing period.
 *
 * ## Product Context
 *
 * When testing subscription adjustments, the proration calculation considers
 * existing payments for the billing period. Without a simulated payment:
 * - End-of-period downgrades fail because rawNetCharge > 0
 * - The test doesn't reflect real-world scenarios where customers have paid
 *
 * ## Testing Strategy
 *
 * - **paid**: Simulates a successful payment for the initial subscription.
 *   This is the realistic scenario for testing subscription adjustments.
 * - **unpaid**: No payment is created. Use this for testing edge cases like
 *   new subscriptions that haven't been charged yet.
 */

import { Dependency } from '../index'

/**
 * Configuration for payment simulation variant.
 */
interface PaymentSimulationConfig {
  /** Whether to create a simulated payment */
  createPayment: boolean
  /** Human-readable description */
  description: string
}

/**
 * PaymentSimulationDep - Controls whether initial payment is simulated.
 *
 * This dependency allows tests to choose whether the subscription
 * has been paid for, affecting proration calculations.
 */
export abstract class PaymentSimulationDep extends Dependency<PaymentSimulationConfig>() {
  abstract createPayment: boolean
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Paid
 *
 * Simulates a successful payment for the initial billing period.
 * This is the default for most tests as it reflects real-world behavior.
 */
PaymentSimulationDep.implement('paid', {
  createPayment: true,
  description: 'Payment simulated',
})

/**
 * Unpaid
 *
 * No payment is created. Use for testing edge cases like:
 * - New subscriptions that haven't been charged
 * - Testing validation that depends on payment state
 */
PaymentSimulationDep.implement('unpaid', {
  createPayment: false,
  description: 'No payment simulated',
})
