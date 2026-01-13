/**
 * Behavioral Testing Framework - Dependency Base Class
 *
 * Provides the static `implement` and `get` methods for dependency classes.
 */

import type { DependencyClass, DependencyFactory } from './types'

/**
 * Registry storing implementations for each dependency class.
 * Uses WeakMap to allow garbage collection of unused dependency classes.
 */
const registry = new WeakMap<
  DependencyClass,
  Map<string, DependencyFactory<unknown>>
>()

/**
 * Get or create the implementations map for a dependency class.
 */
function getOrCreateImplMap(
  depClass: DependencyClass
): Map<string, DependencyFactory<unknown>> {
  let implMap = registry.get(depClass)
  if (!implMap) {
    implMap = new Map()
    registry.set(depClass, implMap)
  }
  return implMap
}

/**
 * Deep clone an object, preserving functions.
 * Functions are shared (not cloned) since they should be stateless.
 * Data (objects, arrays, primitives) is deep cloned for isolation.
 */
function deepCloneWithFunctions<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepCloneWithFunctions(item)) as T
  }

  const cloned = {} as T
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key]
    if (typeof value === 'function') {
      // Functions are shared - they should be stateless
      cloned[key] = value
    } else {
      cloned[key] = deepCloneWithFunctions(value)
    }
  }
  return cloned
}

/**
 * Register an implementation for a dependency class.
 * The implementation is deep-cloned each time the factory is called
 * to ensure test isolation (mutations in one test don't leak to others).
 * Functions are preserved (shared) since they should be stateless.
 */
export function registerImplementation<T extends DependencyClass>(
  depClass: T,
  name: string,
  implementation: InstanceType<T>
): void {
  const implMap = getOrCreateImplMap(depClass)
  const factory: DependencyFactory<InstanceType<T>> = () => {
    // Deep clone data while preserving functions
    // This prevents accidental state sharing between tests, including nested objects
    return deepCloneWithFunctions(implementation)
  }
  implMap.set(name, factory)
}

/**
 * Get a specific implementation instance by name.
 */
export function getImplementation<T extends DependencyClass>(
  depClass: T,
  name: string
): InstanceType<T> {
  const implMap = registry.get(depClass)
  if (!implMap) {
    throw new Error(
      `No implementations registered for ${depClass.name}. Call ${depClass.name}.implement() first.`
    )
  }

  const factory = implMap.get(name)
  if (!factory) {
    const available = Array.from(implMap.keys()).join(', ')
    throw new Error(
      `Implementation '${name}' not found for ${depClass.name}. Available: ${available}`
    )
  }

  return factory() as InstanceType<T>
}

/**
 * Get all registered implementations for a dependency class.
 */
export function getImplementations<T extends DependencyClass>(
  depClass: T
): Map<string, DependencyFactory<InstanceType<T>>> {
  const implMap = registry.get(depClass)
  if (!implMap) {
    return new Map()
  }
  return implMap as Map<string, DependencyFactory<InstanceType<T>>>
}

/**
 * Clear all implementations for a dependency class.
 * Useful for test cleanup.
 */
export function clearImplementations(
  depClass: DependencyClass
): void {
  registry.delete(depClass)
}

/**
 * Creates a dependency class with static implement/get/getAll methods.
 *
 * Usage:
 * ```typescript
 * // Define return types to avoid repetition
 * type CreateCustomerResult = Promise<Customer.Record>
 *
 * interface Residency {
 *   createCustomer(orgId: string): CreateCustomerResult
 *   countryCode: string
 * }
 *
 * abstract class ResidencyDep extends Dependency<Residency>() {
 *   abstract createCustomer(orgId: string): CreateCustomerResult
 *   abstract countryCode: string
 * }
 *
 * ResidencyDep.implement('us', { countryCode: 'US', createCustomer: ... })
 * const us = ResidencyDep.get('us')
 * ```
 */
export function Dependency<T>() {
  abstract class DependencyBase {
    static implement(name: string, implementation: T): void {
      registerImplementation(
        this as unknown as DependencyClass,
        name,
        implementation as InstanceType<DependencyClass>
      )
    }

    static get(name: string): T {
      return getImplementation(
        this as unknown as DependencyClass,
        name
      ) as T
    }

    static getAll(): Map<string, DependencyFactory<T>> {
      return getImplementations(
        this as unknown as DependencyClass
      ) as Map<string, DependencyFactory<T>>
    }
  }

  return DependencyBase as {
    new (): DependencyBase
    implement(name: string, implementation: T): void
    get(name: string): T
    getAll(): Map<string, DependencyFactory<T>>
  }
}
