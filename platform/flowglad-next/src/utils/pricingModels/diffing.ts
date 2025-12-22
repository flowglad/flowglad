/**
 * Type definitions and utilities for diffing pricing model resources.
 *
 * This module provides generic slug-based diffing functionality for pricing model resources
 * (features, products, usage meters) to identify what needs to be created, updated, or removed.
 */

/**
 * A resource with a slug identifier.
 */
export type SluggedResource<T> = T & { slug: string }

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
