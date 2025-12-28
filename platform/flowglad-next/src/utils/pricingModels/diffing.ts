/**
 * Type definitions and utilities for diffing pricing model resources.
 *
 * This module provides generic slug-based diffing functionality for pricing model resources
 * (features, products, usage meters) to identify what needs to be created, updated, or removed.
 */

import type {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
  SetupPricingModelProductPriceInput,
} from './setupSchemas'

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
 * Input type for product diffing - same as SetupPricingModelProductInput.
 * Products are complex objects with nested product, price, and features.
 */
export type ProductDiffInput = SetupPricingModelProductInput

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

/**
 * Result of diffing two arrays of products.
 *
 * Similar to DiffResult but with additional price comparison information
 * for products that need to be updated.
 */
export type ProductDiffResult = {
  /**
   * Products that exist in the existing array but not in the proposed array.
   * These products should be removed.
   */
  toRemove: ProductDiffInput[]
  /**
   * Products that exist in the proposed array but not in the existing array.
   * These products should be created.
   */
  toCreate: ProductDiffInput[]
  /**
   * Products that exist in both arrays (matched by product slug).
   * These products may need to be updated if their properties differ.
   * Includes price diff information when prices differ.
   */
  toUpdate: Array<{
    existing: ProductDiffInput
    proposed: ProductDiffInput
    /**
     * Price comparison information when prices differ or one is missing.
     * Only present if the prices are different or one is undefined.
     */
    priceDiff?: {
      existingPrice?: SetupPricingModelProductPriceInput
      proposedPrice?: SetupPricingModelProductPriceInput
    }
  }>
}

/**
 * Extracts the product slug from a ProductDiffInput for slug-based diffing.
 */
const getProductSlug = (productInput: ProductDiffInput): string => {
  return productInput.product.slug
}

/**
 * Converts ProductDiffInput array to a format compatible with diffSluggedResources
 * by adding the slug at the top level.
 */
const toSluggedProducts = (
  products: ProductDiffInput[]
): SluggedResource<ProductDiffInput>[] => {
  return products.map((p) => ({
    ...p,
    slug: getProductSlug(p),
  }))
}

/**
 * Checks if two prices are different by comparing their JSON representations.
 */
const pricesAreDifferent = (
  existingPrice: SetupPricingModelProductPriceInput | undefined,
  proposedPrice: SetupPricingModelProductPriceInput | undefined
): boolean => {
  // Both undefined means no difference
  if (existingPrice === undefined && proposedPrice === undefined) {
    return false
  }
  // One undefined and one defined means different
  if (existingPrice === undefined || proposedPrice === undefined) {
    return true
  }
  // Both defined - compare by JSON stringification
  return (
    JSON.stringify(existingPrice) !== JSON.stringify(proposedPrice)
  )
}

/**
 * Diffs product arrays to identify which products need to be removed, created, or updated.
 *
 * Products are compared by their product.slug field. For products that exist in both
 * arrays, the function also compares their prices and includes price diff information
 * in the result.
 *
 * @param existing - Array of existing products (SetupPricingModelProductInput)
 * @param proposed - Array of proposed products (SetupPricingModelProductInput)
 * @returns A ProductDiffResult containing products to remove, create, and update with price diffs
 *
 * @example
 * ```typescript
 * const existing = [{
 *   product: { slug: 'pro', name: 'Pro Plan', ... },
 *   price: { type: 'subscription', unitPrice: 1000, ... },
 *   features: ['feature-a']
 * }]
 * const proposed = [{
 *   product: { slug: 'pro', name: 'Pro Plan Updated', ... },
 *   price: { type: 'subscription', unitPrice: 2000, ... },
 *   features: ['feature-a', 'feature-b']
 * }]
 * const diff = diffProducts(existing, proposed)
 * // diff.toUpdate[0] will contain the product with priceDiff showing the unitPrice change
 * ```
 */
export const diffProducts = (
  existing: ProductDiffInput[],
  proposed: ProductDiffInput[]
): ProductDiffResult => {
  // Convert to slugged format for generic diffing
  const sluggedExisting = toSluggedProducts(existing)
  const sluggedProposed = toSluggedProducts(proposed)

  // Use generic diffing for basic categorization
  const baseDiff = diffSluggedResources(
    sluggedExisting,
    sluggedProposed
  )

  // Build the result with price diffs for updates
  const toUpdate = baseDiff.toUpdate.map(
    ({ existing: existingProduct, proposed: proposedProduct }) => {
      // Cast to ProductDiffInput to access price property
      const existing = existingProduct as unknown as ProductDiffInput
      const proposed = proposedProduct as unknown as ProductDiffInput

      const existingPrice = existing.price
      const proposedPrice = proposed.price

      // Check if prices are different
      const hasPriceDiff = pricesAreDifferent(
        existingPrice,
        proposedPrice
      )

      // Build the update entry
      const updateEntry: ProductDiffResult['toUpdate'][number] = {
        existing,
        proposed,
      }

      // Only include priceDiff if prices are actually different
      if (hasPriceDiff) {
        updateEntry.priceDiff = {
          existingPrice,
          proposedPrice,
        }
      }

      return updateEntry
    }
  ) as ProductDiffResult['toUpdate']

  return {
    toRemove: baseDiff.toRemove as unknown as ProductDiffInput[],
    toCreate: baseDiff.toCreate as unknown as ProductDiffInput[],
    toUpdate,
  }
}
