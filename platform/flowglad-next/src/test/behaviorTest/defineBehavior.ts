/**
 * Behavioral Testing Framework - Behavior Definition
 */

import type {
  BehaviorDefinition,
  DependencyClass,
  ResolvedDependencies,
} from './types'

/**
 * Creates a behavior definition.
 *
 * Behaviors are pure operation sequences - they contain no assertions.
 * They receive dependency instances and optional previous state,
 * and return a result that can be asserted against.
 *
 * @example
 * ```typescript
 * const createCustomerBehavior = defineBehavior({
 *   name: 'create customer',
 *   dependencies: [ResidencyDep],
 *   run: async ({ residencyDep }, prev: { org: Organization }) => {
 *     const customer = await residencyDep.createCustomer(prev.org.id)
 *     return { ...prev, customer }
 *   }
 * })
 * ```
 */
export function defineBehavior<
  TDeps extends DependencyClass[],
  TResult,
  TPrev = undefined,
>(config: {
  name: string
  dependencies: TDeps
  run: (deps: ResolvedDependencies, prev: TPrev) => Promise<TResult>
}): BehaviorDefinition<TDeps, TResult, TPrev> {
  return {
    name: config.name,
    dependencies: config.dependencies,
    run: config.run,
  }
}
