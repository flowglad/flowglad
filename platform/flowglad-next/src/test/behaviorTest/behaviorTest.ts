/**
 * Behavioral Testing Framework - Main Test Runner
 *
 * Runs behaviors against the cartesian product of all registered
 * dependency implementations, asserting universal invariants.
 */

import { afterAll, describe, it } from 'vitest'
import {
  combinationMatches,
  formatCombination,
  generateCombinations,
} from './cartesian'
import { getImplementation } from './Dependency'
import type {
  BehaviorTestConfig,
  ChainStep,
  DependencyClass,
  DependencyCombination,
} from './types'

/**
 * Collects all unique dependency classes from a chain of behaviors.
 */
function collectDependencyClasses(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: ChainStep<any, any, any>[]
): DependencyClass[] {
  const seen = new Set<DependencyClass>()
  const result: DependencyClass[] = []

  for (const step of chain) {
    for (const depClass of step.behavior.dependencies) {
      if (!seen.has(depClass)) {
        seen.add(depClass)
        result.push(depClass)
      }
    }
  }

  return result
}

/**
 * Instantiates dependencies for a specific combination.
 */
function instantiateDependencies(
  depClasses: DependencyClass[],
  combination: DependencyCombination
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const depClass of depClasses) {
    const implName = combination[depClass.name]
    if (!implName) {
      throw new Error(
        `No implementation specified for ${depClass.name} in combination`
      )
    }

    const instance = getImplementation(depClass, implName)
    // Use uncapitalized class name as key (e.g., ResidencyDep -> residencyDep)
    const key =
      depClass.name.charAt(0).toLowerCase() + depClass.name.slice(1)
    resolved[key] = instance
  }

  return resolved
}

/**
 * Main entry point: runs a behavior chain against all dependency combinations.
 *
 * Creates a describe block with nested it blocks for each combination.
 * Each combination runs through the entire behavior chain, asserting
 * invariants after each step.
 *
 * @example
 * ```typescript
 * behaviorTest({
 *   chain: [
 *     {
 *       behavior: createOrgBehavior,
 *       invariants: (result) => {
 *         expect(result.organization.id).toBeTruthy()
 *       }
 *     },
 *     {
 *       behavior: createCustomerBehavior,
 *       invariants: (result) => {
 *         expect(result.customer.organizationId).toBe(result.organization.id)
 *       }
 *     }
 *   ],
 *   // Optional: cleanup after all tests
 *   teardown: async (results) => {
 *     for (const result of results) {
 *       await teardownOrg({ organizationId: result.organization.id })
 *     }
 *   }
 * })
 * ```
 */
export function behaviorTest(config: BehaviorTestConfig): void {
  const {
    chain,
    testOptions,
    only,
    skip,
    teardown,
    describeFunction,
  } = config
  const describeBlock = describeFunction ?? describe

  if (chain.length === 0) {
    throw new Error(
      'behaviorTest requires at least one behavior in the chain'
    )
  }

  // Collect all dependency classes from the chain
  const depClasses = collectDependencyClasses(chain)

  // Generate all combinations
  let combinations = generateCombinations(depClasses)

  // Apply only filter
  if (only && only.length > 0) {
    combinations = combinations.filter((combo) =>
      only.some((filter) => combinationMatches(combo, filter))
    )
  }

  // Apply skip filter
  if (skip && skip.length > 0) {
    combinations = combinations.filter(
      (combo) =>
        !skip.some((filter) => combinationMatches(combo, filter))
    )
  }

  // Fail if no combinations remain after filtering
  if (combinations.length === 0) {
    throw new Error(
      'behaviorTest: No test combinations remain after applying only/skip filters. ' +
        'Check your filter configuration or ensure implementations are registered.'
    )
  }

  // Build describe block name from behavior names
  const behaviorNames = chain
    .map((step) => step.behavior.name)
    .join(' -> ')

  // Track final results from each test for teardown
  const finalResults: unknown[] = []

  describeBlock(`Behavior: ${behaviorNames}`, () => {
    // Register teardown hook if provided
    if (teardown) {
      afterAll(async () => {
        await teardown(finalResults)
      })
    }

    for (const combination of combinations) {
      const testName = formatCombination(combination)

      it(
        testName,
        async () => {
          // Fresh dependencies for isolation
          const resolvedDeps = instantiateDependencies(
            depClasses,
            combination
          )

          // Run through the chain
          let prev: unknown = undefined
          let hasResult = false

          try {
            for (const step of chain) {
              // Run behavior
              const result = await step.behavior.run(
                resolvedDeps,
                prev
              )

              // Track that we have a result (for teardown even if invariants fail)
              prev = result
              hasResult = true

              // Assert invariants if provided
              if (step.invariants) {
                await step.invariants(result, combination)
              }
            }
          } finally {
            // Track result for teardown even if test failed mid-chain
            // This ensures resources created by successful behaviors get cleaned up
            if (hasResult) {
              finalResults.push(prev)
            }
          }
        },
        testOptions
      )
    }
  })
}
