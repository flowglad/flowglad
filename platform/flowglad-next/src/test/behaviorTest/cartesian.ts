/**
 * Behavioral Testing Framework - Cartesian Product Utilities
 */

import type { DependencyClass, DependencyCombination } from './types'
import { getImplementations } from './Dependency'

/**
 * Generates all combinations of dependency implementations.
 *
 * Given dependency classes with registered implementations:
 * - ResidencyDep: { us, eu }
 * - OrgTypeDep: { standard, enterprise }
 *
 * Produces:
 * [
 *   { ResidencyDep: 'us', OrgTypeDep: 'standard' },
 *   { ResidencyDep: 'us', OrgTypeDep: 'enterprise' },
 *   { ResidencyDep: 'eu', OrgTypeDep: 'standard' },
 *   { ResidencyDep: 'eu', OrgTypeDep: 'enterprise' }
 * ]
 */
export function generateCombinations(
  depClasses: DependencyClass[]
): DependencyCombination[] {
  if (depClasses.length === 0) {
    return [{}]
  }

  // Get implementation names for each dependency class
  const depImplNames: Array<{
    className: string
    implNames: string[]
  }> = []

  for (const depClass of depClasses) {
    const implMap = getImplementations(depClass)
    const implNames = Array.from(implMap.keys())

    if (implNames.length === 0) {
      throw new Error(
        `No implementations registered for ${depClass.name}. Call ${depClass.name}.implement() first.`
      )
    }

    depImplNames.push({
      className: depClass.name,
      implNames,
    })
  }

  // Generate cartesian product
  return cartesianProduct(depImplNames)
}

/**
 * Recursive cartesian product generation.
 */
function cartesianProduct(
  deps: Array<{ className: string; implNames: string[] }>
): DependencyCombination[] {
  if (deps.length === 0) {
    return [{}]
  }

  const [first, ...rest] = deps
  const restCombinations = cartesianProduct(rest)

  const result: DependencyCombination[] = []

  for (const implName of first.implNames) {
    for (const restCombo of restCombinations) {
      result.push({
        [first.className]: implName,
        ...restCombo,
      })
    }
  }

  return result
}

/**
 * Formats a combination for use in test names.
 *
 * Example: { ResidencyDep: 'us', OrgTypeDep: 'standard' }
 *       => 'ResidencyDep=us, OrgTypeDep=standard'
 */
export function formatCombination(
  combination: DependencyCombination
): string {
  return Object.entries(combination)
    .map(([className, implName]) => `${className}=${implName}`)
    .join(', ')
}

/**
 * Checks if a combination matches a filter.
 * A filter matches if all its specified keys match the combination.
 */
export function combinationMatches(
  combination: DependencyCombination,
  filter: DependencyCombination
): boolean {
  return Object.entries(filter).every(
    ([key, value]) => combination[key] === value
  )
}
