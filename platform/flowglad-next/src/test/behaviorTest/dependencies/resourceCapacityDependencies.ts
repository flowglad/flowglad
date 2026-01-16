/**
 * Resource Capacity Dependencies
 *
 * Defines resource capacity variants for behavior tests, representing
 * different capacity configurations for resource features.
 *
 * ## Product Context
 *
 * Resource features have an "amount" that represents capacity per
 * subscription item quantity. The total capacity is:
 *   totalCapacity = feature.amount × subscriptionItem.quantity
 *
 * Different capacity sizes create different test scenarios:
 * - Single slot: Edge cases around 1-seat resources
 * - Small capacity: Common team-based resources
 * - Large capacity: Enterprise scenarios
 *
 * ## Testing Strategy
 *
 * Tests run against different capacities to ensure:
 * - Capacity math works correctly at boundaries
 * - Validation handles single-slot edge cases
 * - Large capacity calculations don't overflow
 */

import { Dependency } from '../index'

/**
 * Configuration for a resource capacity variant.
 */
interface ResourceCapacityConfig {
  /** The capacity amount for the resource feature */
  amount: number
  /** Human-readable description */
  description: string
}

/**
 * ResourceCapacityDep - Capacity configuration for resource features.
 *
 * This dependency creates test variants for different capacity sizes,
 * ensuring capacity calculations work correctly across ranges.
 */
export abstract class ResourceCapacityDep extends Dependency<ResourceCapacityConfig>() {
  abstract amount: number
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * Single Slot
 *
 * Resource has capacity of 1. Edge case for single-seat licenses.
 */
ResourceCapacityDep.implement('single-slot', {
  amount: 1,
  description: 'Single slot capacity (1)',
})

/**
 * Small Capacity
 *
 * Resource has capacity of 5. Common for small team resources.
 */
ResourceCapacityDep.implement('small-capacity', {
  amount: 5,
  description: 'Small capacity (5)',
})

/**
 * Large Capacity
 *
 * Resource has capacity of 100. Enterprise-scale resources.
 */
ResourceCapacityDep.implement('large-capacity', {
  amount: 100,
  description: 'Large capacity (100)',
})
