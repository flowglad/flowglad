/**
 * Resource Claim State Dependencies
 *
 * Defines resource claim state variants for behavior tests, representing
 * the state of resource claims when a subscription adjustment occurs.
 *
 * ## Product Context
 *
 * Resource claims represent "checked out" capacity from a subscription's
 * resource feature. During subscription adjustments, the system must validate
 * that downgrade capacity >= active claims.
 *
 * ## Testing Strategy
 *
 * Tests run against different claim states to ensure:
 * - Downgrade validation works correctly with no claims
 * - Downgrade validation works correctly with partial claims
 * - Downgrade validation correctly blocks when at capacity
 * - End-of-period scheduling handles deferred capacity validation
 */

import { Dependency } from '../index'

/**
 * Configuration for a resource claim state variant.
 */
interface ResourceClaimStateConfig {
  /**
   * The claim occupancy level as a fraction (0 to 1).
   * - 0: No claims
   * - 0.5: Half capacity used
   * - 1: Full capacity used
   */
  claimOccupancy: number
  /** Human-readable description */
  description: string
}

/**
 * ResourceClaimStateDep - State of resource claims when adjustment occurs.
 *
 * This dependency creates test variants for different claim states,
 * ensuring adjustments handle capacity validation correctly.
 */
export abstract class ResourceClaimStateDep extends Dependency<ResourceClaimStateConfig>() {
  abstract claimOccupancy: number
  abstract description: string
}

// =============================================================================
// Implementations
// =============================================================================

/**
 * No Claims
 *
 * Resource has no active claims. Downgrades should always succeed.
 */
ResourceClaimStateDep.implement('no-claims', {
  claimOccupancy: 0,
  description: 'No active claims',
})

/**
 * Partial Claims
 *
 * Resource has some capacity used (~50%). Downgrades may succeed
 * depending on new capacity.
 */
ResourceClaimStateDep.implement('partial-claims', {
  claimOccupancy: 0.5,
  description: 'Partial claims (50% capacity)',
})

/**
 * At Capacity
 *
 * All capacity claimed. Downgrades to lower capacity should fail
 * with immediate timing.
 */
ResourceClaimStateDep.implement('at-capacity', {
  claimOccupancy: 1,
  description: 'At capacity (100% claimed)',
})
