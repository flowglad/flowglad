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
 * Register an implementation for a dependency class.
 */
export function registerImplementation<T extends DependencyClass>(
  depClass: T,
  name: string,
  implementation: Omit<InstanceType<T>, never>
): void {
  const implMap = getOrCreateImplMap(depClass)
  const factory: DependencyFactory<InstanceType<T>> = () => {
    return implementation as InstanceType<T>
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
 * abstract class ResidencyDep extends Dependency<ResidencyDep>() {
 *   abstract createCustomer(orgId: string): Promise<Customer>
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
        implementation as Omit<InstanceType<DependencyClass>, never>
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

// Keep the old helpers for backwards compatibility
export function createImplement<T extends DependencyClass>() {
  return function implement(
    this: T,
    name: string,
    implementation: Omit<InstanceType<T>, never>
  ): void {
    registerImplementation(this, name, implementation)
  }
}

export function createGet<T extends DependencyClass>() {
  return function get(this: T, name: string): InstanceType<T> {
    return getImplementation(this, name)
  }
}

export function createGetAll<T extends DependencyClass>() {
  return function getAll(
    this: T
  ): Map<string, DependencyFactory<InstanceType<T>>> {
    return getImplementations(this)
  }
}
