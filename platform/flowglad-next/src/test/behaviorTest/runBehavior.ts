/**
 * Behavioral Testing Framework - Single Behavior Execution
 */

import type {
  BehaviorDefinition,
  DependencyClass,
  ResolvedDependencies,
} from './types'

/**
 * Runs a single behavior with the given dependencies and optional previous state.
 *
 * This is useful for:
 * 1. Integration tests that want to reuse a behavior with specific dependency implementations
 * 2. Running behaviors outside of the cartesian product test runner
 *
 * @example
 * ```typescript
 * // In an integration test
 * it('handles EU customer creation', async () => {
 *   const euResidency = ResidencyDep.get('eu')
 *   const result = await runBehavior(
 *     createCustomerBehavior,
 *     { residencyDep: euResidency },
 *     { org }
 *   )
 *   expect(result.customer.organizationId).toBe(org.id)
 * })
 * ```
 */
export async function runBehavior<
  TDeps extends DependencyClass[],
  TResult,
  TPrev,
>(
  behavior: BehaviorDefinition<TDeps, TResult, TPrev>,
  deps: ResolvedDependencies,
  prev: TPrev
): Promise<TResult> {
  return behavior.run(deps, prev)
}
