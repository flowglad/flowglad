/**
 * Type definitions and utilities for diffing pricing model resources.
 *
 * This module provides generic slug-based diffing functionality for pricing model resources
 * (features, products, usage meters) to identify what needs to be created, updated, or removed.
 */

import * as R from 'ramda'
import { z } from 'zod'
import {
  toggleFeatureClientUpdateSchema,
  usageCreditGrantFeatureClientUpdateSchema,
} from '@/db/schema/features'
import {
  priceImmutableFields,
  singlePaymentPriceClientInsertSchema,
  singlePaymentPriceClientUpdateSchema,
  subscriptionPriceClientInsertSchema,
  subscriptionPriceClientUpdateSchema,
  usagePriceClientInsertSchema,
  usagePriceClientUpdateSchema,
} from '@/db/schema/prices'
import { productsClientUpdateSchema } from '@/db/schema/products'
import { usageMetersClientUpdateSchema } from '@/db/schema/usageMeters'
import { FeatureType, PriceType } from '@/types'
import type {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
  SetupPricingModelProductPriceInput,
  SetupUsageMeterPriceInput,
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
 * Extracts the slug from a UsageMeterDiffInput for slug-based diffing.
 * Usage meters now have a nested structure: { usageMeter: { slug, name, ... }, prices: [...] }
 */
const getUsageMeterSlug = (
  meterInput: UsageMeterDiffInput
): string => {
  return meterInput.usageMeter.slug
}

/**
 * Converts UsageMeterDiffInput array to a format compatible with diffSluggedResources
 * by adding the slug at the top level.
 */
const toSluggedUsageMeters = (
  meters: UsageMeterDiffInput[]
): SluggedResource<UsageMeterDiffInput>[] => {
  return meters.map((m) => ({
    ...m,
    slug: getUsageMeterSlug(m),
  }))
}

/**
 * Diffs usage meter arrays to identify which usage meters need to be removed, created, or updated.
 *
 * Usage meters are compared by their usageMeter.slug field. The function uses the generic
 * `diffSluggedResources` utility to perform the comparison.
 *
 * For usage meters that exist in both arrays, the function also compares their prices
 * and includes price diff information in the result.
 *
 * Note: Usage meter removal is not allowed and will cause validation errors in later stages.
 *
 * @param existing - Array of existing usage meters (with nested usageMeter and prices)
 * @param proposed - Array of proposed usage meters (with nested usageMeter and prices)
 * @returns A UsageMeterDiffResult containing usage meters to remove, create, and update with price diffs
 *
 * @example
 * ```typescript
 * const existing = [{ usageMeter: { slug: 'api-calls', name: 'API Calls' }, prices: [...] }]
 * const proposed = [{ usageMeter: { slug: 'api-calls', name: 'API Requests' }, prices: [...] }]
 * const diff = diffUsageMeters(existing, proposed)
 * // diff.toUpdate will contain the usage meter with name change and price diff
 * ```
 */
export const diffUsageMeters = (
  existing: UsageMeterDiffInput[],
  proposed: UsageMeterDiffInput[]
): UsageMeterDiffResult => {
  // Convert to slugged format for generic diffing
  const sluggedExisting = toSluggedUsageMeters(existing)
  const sluggedProposed = toSluggedUsageMeters(proposed)

  // Use generic diffing for basic categorization
  const baseDiff = diffSluggedResources(
    sluggedExisting,
    sluggedProposed
  )

  // Build the result with price diffs for updates
  const toUpdate = baseDiff.toUpdate.map(
    ({ existing: existingMeter, proposed: proposedMeter }) => {
      // Cast to UsageMeterDiffInput to access prices
      const existing = existingMeter as unknown as UsageMeterDiffInput
      const proposed = proposedMeter as unknown as UsageMeterDiffInput

      // Diff the prices within this usage meter
      const priceDiff = diffUsageMeterPrices(
        existing.prices,
        proposed.prices
      )

      return {
        existing,
        proposed,
        priceDiff,
      }
    }
  )

  return {
    toRemove: baseDiff.toRemove as unknown as UsageMeterDiffInput[],
    toCreate: baseDiff.toCreate as unknown as UsageMeterDiffInput[],
    toUpdate,
  }
}

/**
 * Result of diffing usage prices within a usage meter.
 * Contains the prices to remove, create, and update for a single usage meter.
 */
export type UsageMeterPriceDiffResult = {
  /**
   * Prices that exist in the existing usage meter but not in the proposed.
   * These prices should be removed (deactivated).
   */
  toRemove: SetupUsageMeterPriceInput[]
  /**
   * Prices that exist in the proposed usage meter but not in the existing.
   * These prices should be created.
   */
  toCreate: SetupUsageMeterPriceInput[]
  /**
   * Prices that exist in both (matched by slug).
   * These prices may need to be updated if their properties differ.
   */
  toUpdate: Array<{
    existing: SetupUsageMeterPriceInput
    proposed: SetupUsageMeterPriceInput
  }>
}

/**
 * Result of diffing two arrays of usage meters.
 *
 * Similar to DiffResult but with additional price comparison information
 * for usage meters that need to be updated.
 */
export type UsageMeterDiffResult = {
  /**
   * Usage meters that exist in the existing array but not in the proposed array.
   * These usage meters should be removed.
   */
  toRemove: UsageMeterDiffInput[]
  /**
   * Usage meters that exist in the proposed array but not in the existing array.
   * These usage meters should be created.
   */
  toCreate: UsageMeterDiffInput[]
  /**
   * Usage meters that exist in both arrays (matched by usageMeter.slug).
   * These usage meters may need to be updated if their properties differ.
   * Includes price diff information when prices differ.
   */
  toUpdate: Array<{
    existing: UsageMeterDiffInput
    proposed: UsageMeterDiffInput
    /**
     * Price comparison information for usage prices within this meter.
     * Always present for updates (may be empty if no price changes).
     */
    priceDiff: UsageMeterPriceDiffResult
  }>
}

/**
 * Extracts the slug from a usage price for slug-based diffing.
 * Falls back to generating a slug from other identifying fields if slug is not present.
 */
const getUsagePriceSlug = (
  price: SetupUsageMeterPriceInput
): string => {
  // Prices should have a slug
  if (price.slug) {
    return price.slug
  }
  // Fallback: generate a unique key from unitPrice and usageEventsPerUnit
  return `__generated__${price.unitPrice}_${price.usageEventsPerUnit}`
}

/**
 * Converts usage prices to a format compatible with diffSluggedResources.
 */
const toSluggedUsagePrices = (
  prices: SetupUsageMeterPriceInput[]
): SluggedResource<SetupUsageMeterPriceInput>[] => {
  return prices.map((p) => ({
    ...p,
    slug: getUsagePriceSlug(p),
  }))
}

/**
 * Diffs usage prices within a usage meter.
 *
 * @param existingPrices - Array of existing usage prices (or undefined/empty)
 * @param proposedPrices - Array of proposed usage prices (or undefined/empty)
 * @returns A UsageMeterPriceDiffResult containing prices to remove, create, and update
 */
export const diffUsageMeterPrices = (
  existingPrices: SetupUsageMeterPriceInput[] | undefined,
  proposedPrices: SetupUsageMeterPriceInput[] | undefined
): UsageMeterPriceDiffResult => {
  const existing = existingPrices || []
  const proposed = proposedPrices || []

  // Convert to slugged format for generic diffing
  const sluggedExisting = toSluggedUsagePrices(existing)
  const sluggedProposed = toSluggedUsagePrices(proposed)

  // Use generic diffing
  const baseDiff = diffSluggedResources(
    sluggedExisting,
    sluggedProposed
  )

  return {
    toRemove:
      baseDiff.toRemove as unknown as SetupUsageMeterPriceInput[],
    toCreate:
      baseDiff.toCreate as unknown as SetupUsageMeterPriceInput[],
    toUpdate: baseDiff.toUpdate.map(({ existing, proposed }) => ({
      existing: existing as unknown as SetupUsageMeterPriceInput,
      proposed: proposed as unknown as SetupUsageMeterPriceInput,
    })),
  }
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
  // Both defined - compare using deep equality
  return !R.equals(existingPrice, proposedPrice)
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

/**
 * Computes an update object containing only the fields that differ between
 * existing and proposed objects.
 *
 * @param existing - The existing object
 * @param proposed - The proposed object
 * @returns An object containing only the fields that differ
 *
 * @example
 * ```typescript
 * const existing = { slug: 'foo', name: 'Old', active: true }
 * const proposed = { slug: 'foo', name: 'New', active: true }
 * const update = computeUpdateObject(existing, proposed)
 * // update = { name: 'New' }
 * ```
 */
export const computeUpdateObject = <
  T extends Record<string, unknown>,
>(
  existing: T,
  proposed: T
): Partial<T> => {
  const update: Partial<T> = {}

  // Get all keys from both objects
  const allKeys = new Set([
    ...Object.keys(existing),
    ...Object.keys(proposed),
  ])

  for (const key of allKeys) {
    const existingValue = existing[key]
    const proposedValue = proposed[key]

    // Compare values for deep equality
    if (!R.equals(existingValue, proposedValue)) {
      update[key as keyof T] = proposedValue as T[keyof T]
    }
  }

  return update
}

/**
 * Validates a usage price change between existing and proposed prices.
 *
 * This function enforces the following rules:
 * - Price type cannot change (usage prices must remain usage prices)
 * - Updates must only modify mutable fields (validated via Zod parsing with strict mode)
 *
 * @param existing - The existing usage price (or undefined for creation)
 * @param proposed - The proposed usage price (or undefined for removal)
 * @param meterSlug - The slug of the usage meter (for error messages)
 * @throws Error if immutable fields are being modified
 */
export const validateUsagePriceChange = (
  existing: SetupUsageMeterPriceInput | undefined,
  proposed: SetupUsageMeterPriceInput | undefined,
  meterSlug: string
): void => {
  // Both undefined - no change
  if (existing === undefined && proposed === undefined) {
    return
  }

  // One undefined, one defined - valid (creation or removal)
  if (existing === undefined || proposed === undefined) {
    return
  }

  // Both exist - validate the change
  const updateObject = computeUpdateObject(existing, proposed)

  // Skip if nothing changed
  if (Object.keys(updateObject).length === 0) {
    return
  }

  // Check if any immutable/create-only fields are being changed.
  // If so, skip strict validation because this price will be replaced entirely
  // (create new price + deactivate old price), not updated.
  const immutableFields = new Set(priceImmutableFields)
  const changedFields = Object.keys(updateObject)
  const hasImmutableFieldChanges = changedFields.some((field) =>
    immutableFields.has(field)
  )

  // If immutable fields are changing, this will be a price replacement.
  // We still need to validate the proposed price is well-formed using the insert schema.
  if (hasImmutableFieldChanges) {
    const insertResult = usagePriceClientInsertSchema
      .omit({ usageMeterId: true, productId: true })
      .safeParse(proposed)

    if (!insertResult.success) {
      throw new Error(
        `Invalid usage price for replacement on meter '${meterSlug}': ${insertResult.error.message}`
      )
    }
    return
  }

  // Try to parse with strict mode - this will fail if any immutable fields are present
  const result = usagePriceClientUpdateSchema
    .partial()
    .strict()
    .safeParse(updateObject)

  if (!result.success) {
    throw new Error(
      `Invalid usage price update on meter '${meterSlug}': ${result.error.message}`
    )
  }
}

/**
 * Validates a usage meter diff result.
 *
 * This function enforces the following rules:
 * - Usage meters cannot be removed (throws if toRemove is non-empty)
 * - Updates must only modify mutable fields (validated via Zod parsing with strict mode)
 * - Usage price changes are validated via validateUsagePriceChange
 *
 * @param diff - The diff result from diffUsageMeters
 * @throws Error if usage meters are being removed or if immutable fields are being modified
 *
 * @example
 * ```typescript
 * const diff = diffUsageMeters(existing, proposed)
 * validateUsageMeterDiff(diff) // throws if invalid
 * ```
 */
export const validateUsageMeterDiff = (
  diff: UsageMeterDiffResult
): void => {
  // Usage meters cannot be removed
  if (diff.toRemove.length > 0) {
    const removedSlugs = diff.toRemove
      .map((m) => m.usageMeter.slug)
      .join(', ')
    throw new Error(
      `Usage meters cannot be removed. Attempted to remove: ${removedSlugs}`
    )
  }

  // Validate each update entry
  for (const { existing, proposed, priceDiff } of diff.toUpdate) {
    const meterSlug = existing.usageMeter.slug

    // Compare the usageMeter nested object, not the top-level object (which includes prices)
    const usageMeterUpdateObject = computeUpdateObject(
      existing.usageMeter,
      proposed.usageMeter
    )

    // Validate usage meter field updates if there are any
    if (Object.keys(usageMeterUpdateObject).length > 0) {
      // Try to parse with strict mode - this will fail if any immutable fields are present
      const result = usageMetersClientUpdateSchema
        .partial()
        .strict()
        .safeParse(usageMeterUpdateObject)

      if (!result.success) {
        throw new Error(
          `Invalid usage meter update for slug '${meterSlug}': ${result.error.message}`
        )
      }
    }

    // Validate usage price updates
    for (const {
      existing: existingPrice,
      proposed: proposedPrice,
    } of priceDiff.toUpdate) {
      validateUsagePriceChange(
        existingPrice,
        proposedPrice,
        meterSlug
      )
    }
  }
}

/**
 * Validates a feature diff result.
 *
 * This function enforces the following rules:
 * - Feature type cannot be changed (throws error if type differs)
 * - Updates must only modify mutable fields (validated via Zod parsing with strict mode)
 *
 * @param diff - The diff result from diffFeatures
 * @throws Error if type changes or if immutable fields are being modified
 *
 * @example
 * ```typescript
 * const diff = diffFeatures(existing, proposed)
 * validateFeatureDiff(diff) // throws if invalid
 * ```
 */
export const validateFeatureDiff = (
  diff: DiffResult<FeatureDiffInput>
): void => {
  for (const { existing, proposed } of diff.toUpdate) {
    // Check for type change first (before Zod parsing)
    if (existing.type !== proposed.type) {
      throw new Error(
        `Feature type cannot be changed. Feature '${existing.slug}' has type '${existing.type}' but proposed type is '${proposed.type}'. To change type, remove the feature and create a new one.`
      )
    }

    const updateObject = computeUpdateObject(existing, proposed)

    // Skip if nothing changed
    if (Object.keys(updateObject).length === 0) {
      continue
    }

    // Select the appropriate schema based on feature type
    const schema =
      existing.type === FeatureType.Toggle
        ? toggleFeatureClientUpdateSchema
        : usageCreditGrantFeatureClientUpdateSchema

    // Handle usageMeterSlug -> usageMeterId transformation for UsageCreditGrant features
    // In the setup schema, we use usageMeterSlug, but the client update schema expects usageMeterId
    // usageMeterId is updatable (per features.ts schemas), so changes to usageMeterSlug are allowed
    // The transformation from usageMeterSlug to usageMeterId is only to align client update payloads
    // with the schema so validation can proceed. Tests expect changing usageMeterSlug/usageMeterId
    // to be allowed (not to throw).
    const transformedUpdate = { ...updateObject }
    if ('usageMeterSlug' in transformedUpdate) {
      // Transform usageMeterSlug to usageMeterId to align with the client update schema
      ;(transformedUpdate as Record<string, unknown>).usageMeterId = (
        transformedUpdate as Record<string, unknown>
      ).usageMeterSlug
      delete (transformedUpdate as Record<string, unknown>)
        .usageMeterSlug
    }

    // Try to parse with strict mode
    const result = schema
      .partial()
      .strict()
      .safeParse(transformedUpdate)

    if (!result.success) {
      throw new Error(
        `Invalid feature update for slug '${existing.slug}': ${result.error.message}`
      )
    }
  }
}

/**
 * Validates a price change between existing and proposed prices.
 *
 * This function enforces the following rules:
 * - Price type cannot change (throws error if types differ)
 * - Updates must only modify mutable fields (validated via Zod parsing with strict mode)
 *
 * @param existing - The existing price (or undefined for creation)
 * @param proposed - The proposed price (or undefined for removal)
 * @throws Error if price type changes or if immutable fields are being modified
 *
 * @example
 * ```typescript
 * validatePriceChange(existingPrice, proposedPrice) // throws if invalid
 * ```
 */
export const validatePriceChange = (
  existing: SetupPricingModelProductPriceInput | undefined,
  proposed: SetupPricingModelProductPriceInput | undefined
): void => {
  // Both undefined - no change
  if (existing === undefined && proposed === undefined) {
    return
  }

  // One undefined, one defined - valid (creation or removal)
  if (existing === undefined || proposed === undefined) {
    return
  }

  // Both exist - validate the change
  // Check for type change first (before Zod parsing)
  if (existing.type !== proposed.type) {
    throw new Error(
      `Price type cannot be changed. Existing type is '${existing.type}' but proposed type is '${proposed.type}'. To change price type, remove the price and create a new one.`
    )
  }

  const updateObject = computeUpdateObject(existing, proposed)

  // Skip if nothing changed
  if (Object.keys(updateObject).length === 0) {
    return
  }

  // Handle usageMeterSlug -> usageMeterId transformation for usage prices
  const transformedUpdate = { ...updateObject }
  if ('usageMeterSlug' in transformedUpdate) {
    // usageMeterSlug changes are not allowed (usageMeterId is create-only)
    ;(transformedUpdate as Record<string, unknown>).usageMeterId = (
      transformedUpdate as Record<string, unknown>
    ).usageMeterSlug
    delete (transformedUpdate as Record<string, unknown>)
      .usageMeterSlug
  }

  // Check if any immutable/create-only fields are being changed.
  // If so, skip strict validation because this price will be replaced entirely
  // (create new price + deactivate old price), not updated.
  const immutableFields = new Set(priceImmutableFields)
  const changedFields = Object.keys(transformedUpdate)
  const hasImmutableFieldChanges = changedFields.some((field) =>
    immutableFields.has(field)
  )

  // If immutable fields are changing, this will be a price replacement.
  // We still need to validate the proposed price is well-formed using the insert schema.
  // Note: Usage prices are now handled separately under usage meters (PR 5),
  // so product prices are only subscription or single payment.
  if (hasImmutableFieldChanges) {
    let insertResult: { success: boolean; error?: z.ZodError }
    switch (proposed.type) {
      case PriceType.Subscription:
        insertResult = subscriptionPriceClientInsertSchema
          .omit({ productId: true })
          .safeParse(proposed)
        break
      case PriceType.SinglePayment:
        insertResult = singlePaymentPriceClientInsertSchema
          .omit({ productId: true })
          .safeParse(proposed)
        break
      default: {
        const unexpectedType = (proposed as { type: string }).type
        throw new Error(
          `Product prices cannot be of type '${unexpectedType}'. Usage prices belong to usage meters.`
        )
      }
    }

    if (!insertResult.success) {
      throw new Error(
        `Invalid price for replacement: ${insertResult.error?.message}`
      )
    }
    return
  }

  // Select the appropriate schema based on price type and try to parse with strict mode
  // Note: Product prices are only subscription or single payment (PR 5)
  let result: { success: boolean; error?: z.ZodError }
  switch (existing.type) {
    case PriceType.Subscription:
      result = subscriptionPriceClientUpdateSchema
        .partial()
        .strict()
        .safeParse(transformedUpdate)
      break
    case PriceType.SinglePayment:
      result = singlePaymentPriceClientUpdateSchema
        .partial()
        .strict()
        .safeParse(transformedUpdate)
      break
    default: {
      const unexpectedType = (existing as { type: string }).type
      throw new Error(
        `Product prices cannot be of type '${unexpectedType}'. Usage prices belong to usage meters.`
      )
    }
  }

  if (!result.success) {
    throw new Error(`Invalid price update: ${result.error?.message}`)
  }
}

/**
 * Validates a product diff result.
 *
 * This function enforces the following rules:
 * - Product updates must only modify mutable fields (validated via Zod parsing with strict mode)
 * - Price changes are validated via validatePriceChange
 *
 * @param diff - The diff result from diffProducts
 * @throws Error if immutable fields are being modified or if price validation fails
 *
 * @example
 * ```typescript
 * const diff = diffProducts(existing, proposed)
 * validateProductDiff(diff) // throws if invalid
 * ```
 */
export const validateProductDiff = (
  diff: ProductDiffResult
): void => {
  for (const { existing, proposed, priceDiff } of diff.toUpdate) {
    // Validate product fields (excluding price field)
    const existingProduct = existing.product
    const proposedProduct = proposed.product

    const productUpdateObject = computeUpdateObject(
      existingProduct,
      proposedProduct
    )

    // Validate product update if there are changes
    if (Object.keys(productUpdateObject).length > 0) {
      const result = productsClientUpdateSchema
        .partial()
        .strict()
        .safeParse(productUpdateObject)

      if (!result.success) {
        throw new Error(
          `Invalid product update for slug '${existingProduct.slug}': ${result.error.message}`
        )
      }
    }

    // Validate price change if there's a price diff
    if (priceDiff) {
      validatePriceChange(
        priceDiff.existingPrice,
        priceDiff.proposedPrice
      )
    }
  }
}

/**
 * Result of diffing two pricing models.
 *
 * Contains the diff results for all resource types (features, products, usage meters).
 */
export type PricingModelDiffResult = {
  /**
   * Diff result for features.
   */
  features: DiffResult<FeatureDiffInput>
  /**
   * Diff result for products, including price comparison.
   */
  products: ProductDiffResult
  /**
   * Diff result for usage meters, including usage price comparison.
   */
  usageMeters: UsageMeterDiffResult
}

/**
 * Diffs two pricing models to identify what needs to be created, updated, or removed.
 *
 * This is the main entry point for pricing model diffing. It performs the following:
 * 1. Diffs features, products, and usage meters by their slugs
 * 2. Validates all diffs to ensure only valid changes are allowed
 * 3. Returns a comprehensive diff result
 *
 * This is a pure function - it does not access the database or have side effects.
 * All validation is performed via Zod parsing with strict mode to ensure only
 * mutable fields can be updated.
 *
 * @param existing - The existing pricing model setup
 * @param proposed - The proposed pricing model setup
 * @returns A PricingModelDiffResult containing all diffs for features, products, and usage meters
 * @throws Error if any validation fails (e.g., trying to remove usage meters, changing immutable fields)
 *
 * @example
 * ```typescript
 * const existing = {
 *   features: [{ slug: 'feature-a', name: 'Feature A', type: 'toggle', active: true }],
 *   products: [{
 *     product: { slug: 'pro', name: 'Pro Plan', ... },
 *     price: { type: 'subscription', unitPrice: 1000, ... },
 *     features: ['feature-a']
 *   }],
 *   usageMeters: [{ slug: 'api-calls', name: 'API Calls', aggregationType: 'sum' }]
 * }
 *
 * const proposed = {
 *   features: [{ slug: 'feature-a', name: 'Feature A Updated', type: 'toggle', active: true }],
 *   products: [{
 *     product: { slug: 'pro', name: 'Pro Plan', ... },
 *     price: { type: 'subscription', unitPrice: 2000, ... },
 *     features: ['feature-a']
 *   }],
 *   usageMeters: [{ slug: 'api-calls', name: 'API Calls', aggregationType: 'sum' }]
 * }
 *
 * const diff = diffPricingModel(existing, proposed)
 * // diff.features.toUpdate will contain the feature with name change
 * // diff.products.toUpdate will contain the product with price unitPrice change
 * // diff.usageMeters will have empty toRemove, toCreate, and toUpdate arrays
 * ```
 */
export const diffPricingModel = (
  existing: SetupPricingModelInput,
  proposed: SetupPricingModelInput
): PricingModelDiffResult => {
  const featuresDiff = diffFeatures(
    existing.features,
    proposed.features
  )
  const productsDiff = diffProducts(
    existing.products,
    proposed.products
  )
  const usageMetersDiff = diffUsageMeters(
    existing.usageMeters,
    proposed.usageMeters
  )

  validateFeatureDiff(featuresDiff)
  validateProductDiff(productsDiff)
  validateUsageMeterDiff(usageMetersDiff)

  return {
    features: featuresDiff,
    products: productsDiff,
    usageMeters: usageMetersDiff,
  }
}
