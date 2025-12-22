/**
 * Type definitions and utilities for diffing pricing model resources.
 *
 * This module provides generic slug-based diffing functionality for pricing model resources
 * (features, products, usage meters) to identify what needs to be created, updated, or removed.
 */

import type { SetupPricingModelInput } from './setupSchemas'

/**
 * A resource with a slug identifier.
 */
export type SluggedResource<T> = T & { slug: string }

/**
 * Input type for feature diffing - extracted from SetupPricingModelInput.
 */
export type FeatureDiffInput =
  SetupPricingModelInput['features'][number]

/**
 * Input type for usage meter diffing - extracted from SetupPricingModelInput.
 */
export type UsageMeterDiffInput =
  SetupPricingModelInput['usageMeters'][number]

/**
 * Result of diffing two arrays of slugged resources.
 *
 * @typeParam T - The resource type (must have a slug field)
 */
export type DiffResult<T> = {
  /**
   * Resources that exist in the existing array but not in the proposed array.
   * These resources should be removed.
   */
  toRemove: SluggedResource<T>[]
  /**
   * Resources that exist in the proposed array but not in the existing array.
   * These resources should be created.
   */
  toCreate: SluggedResource<T>[]
  /**
   * Resources that exist in both arrays (matched by slug).
   * These resources may need to be updated if their properties differ.
   */
  toUpdate: Array<{
    existing: SluggedResource<T>
    proposed: SluggedResource<T>
  }>
}

/**
 * Generic slug-based diffing function for pricing model resources.
 *
 * Compares two arrays of resources by their slug field and identifies which resources
 * need to be removed, created, or potentially updated.
 *
 * @param existing - Array of existing resources
 * @param proposed - Array of proposed resources
 * @returns A DiffResult containing resources to remove, create, and update
 *
 * @example
 * ```typescript
 * const existing = [{ slug: 'foo', name: 'Old' }, { slug: 'bar', name: 'Bar' }]
 * const proposed = [{ slug: 'bar', name: 'Bar' }, { slug: 'baz', name: 'New' }]
 * const diff = diffSluggedResources(existing, proposed)
 * // diff.toRemove = [{ slug: 'foo', name: 'Old' }]
 * // diff.toCreate = [{ slug: 'baz', name: 'New' }]
 * // diff.toUpdate = [{ existing: { slug: 'bar', ... }, proposed: { slug: 'bar', ... } }]
 * ```
 */
export const diffSluggedResources = <T extends { slug: string }>(
  existing: SluggedResource<T>[],
  proposed: SluggedResource<T>[]
): DiffResult<T> => {
  // Create maps for efficient lookup by slug
  const existingMap = new Map<string, SluggedResource<T>>()
  const proposedMap = new Map<string, SluggedResource<T>>()

  for (const resource of existing) {
    existingMap.set(resource.slug, resource)
  }

  for (const resource of proposed) {
    proposedMap.set(resource.slug, resource)
  }

  const toRemove: SluggedResource<T>[] = []
  const toCreate: SluggedResource<T>[] = []
  const toUpdate: Array<{
    existing: SluggedResource<T>
    proposed: SluggedResource<T>
  }> = []

  // Find resources to remove (in existing but not in proposed)
  for (const [slug, resource] of existingMap) {
    if (!proposedMap.has(slug)) {
      toRemove.push(resource)
    }
  }

  // Find resources to create (in proposed but not in existing)
  // and resources to update (in both)
  for (const [slug, proposedResource] of proposedMap) {
    const existingResource = existingMap.get(slug)
    if (existingResource) {
      // Resource exists in both - may need update
      toUpdate.push({
        existing: existingResource,
        proposed: proposedResource,
      })
    } else {
      // Resource only in proposed - needs to be created
      toCreate.push(proposedResource)
    }
  }

  return {
    toRemove,
    toCreate,
    toUpdate,
  }
}

/**
 * Diffs feature arrays to identify which features need to be removed, created, or updated.
 *
 * Features are compared by their slug field. The function uses the generic
 * `diffSluggedResources` utility to perform the comparison.
 *
 * @param existing - Array of existing features
 * @param proposed - Array of proposed features
 * @returns A DiffResult containing features to remove, create, and update
 *
 * @example
 * ```typescript
 * const existing = [{ slug: 'feature-a', name: 'Feature A', type: 'toggle', active: true }]
 * const proposed = [{ slug: 'feature-a', name: 'Feature A Updated', type: 'toggle', active: true }]
 * const diff = diffFeatures(existing, proposed)
 * // diff.toUpdate will contain the feature with name change
 * ```
 */
export const diffFeatures = (
  existing: FeatureDiffInput[],
  proposed: FeatureDiffInput[]
): DiffResult<FeatureDiffInput> => {
  return diffSluggedResources(existing, proposed)
}

/**
 * Diffs usage meter arrays to identify which usage meters need to be removed, created, or updated.
 *
 * Usage meters are compared by their slug field. The function uses the generic
 * `diffSluggedResources` utility to perform the comparison.
 *
 * Note: Usage meter removal is not allowed and will cause validation errors in later stages.
 *
 * @param existing - Array of existing usage meters
 * @param proposed - Array of proposed usage meters
 * @returns A DiffResult containing usage meters to remove, create, and update
 *
 * @example
 * ```typescript
 * const existing = [{ slug: 'api-calls', name: 'API Calls', aggregationType: 'sum' }]
 * const proposed = [{ slug: 'api-calls', name: 'API Requests', aggregationType: 'sum' }]
 * const diff = diffUsageMeters(existing, proposed)
 * // diff.toUpdate will contain the usage meter with name change
 * ```
 */
export const diffUsageMeters = (
  existing: UsageMeterDiffInput[],
  proposed: UsageMeterDiffInput[]
): DiffResult<UsageMeterDiffInput> => {
  return diffSluggedResources(existing, proposed)
}
