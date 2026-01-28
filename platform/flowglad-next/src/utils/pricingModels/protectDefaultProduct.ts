/**
 * Default product protection for pricing model updates.
 *
 * This module provides functions to protect the default product from invalid modifications
 * during pricing model updates. The default product has special constraints - only certain
 * fields (name, description, features) can be modified, while other fields (slug, price,
 * active status, etc.) are protected.
 */

import { Result } from 'better-result'
import * as R from 'ramda'
import { ValidationError } from '@/errors'
import type {
  SetupPricingModelInput,
  SetupPricingModelProductInput,
} from './setupSchemas'

/**
 * Fields on the default product that are allowed to be modified.
 * All other fields will be preserved from the existing default product.
 */
export const ALLOWED_DEFAULT_PRODUCT_FIELDS = [
  'name',
  'description',
] as const

/**
 * Finds the default product in a pricing model input.
 * A default product is identified by `product.default === true`.
 *
 * @param input - The pricing model setup input
 * @returns The default product input, or undefined if none exists
 */
export const findDefaultProduct = (
  input: SetupPricingModelInput
): SetupPricingModelProductInput | undefined => {
  return input.products.find((p) => p.product.default === true)
}

/**
 * Finds a product by slug in a pricing model input.
 *
 * @param input - The pricing model setup input
 * @param slug - The slug to search for
 * @returns The product input with matching slug, or undefined if not found
 */
export const findProductBySlug = (
  input: SetupPricingModelInput,
  slug: string
): SetupPricingModelProductInput | undefined => {
  return input.products.find((p) => p.product.slug === slug)
}

/**
 * Validates that the proposed input doesn't have multiple default products.
 *
 * @param proposedInput - The proposed pricing model input
 * @returns Result with void on success, ValidationError if more than one product has default=true
 */
export const validateSingleDefaultProduct = (
  proposedInput: SetupPricingModelInput
): Result<void, ValidationError> => {
  const defaultProducts = proposedInput.products.filter(
    (p) => p.product.default === true
  )

  if (defaultProducts.length > 1) {
    const slugs = defaultProducts
      .map((p) => p.product.slug)
      .join(', ')
    return Result.err(
      new ValidationError(
        'products',
        `Only one product can be marked as default. Found ${defaultProducts.length} default products: ${slugs}`
      )
    )
  }

  return Result.ok(undefined)
}

/**
 * Checks if the proposed default product has any protected field changes
 * compared to the existing default product.
 *
 * Protected fields include:
 * - Product: slug, active, default
 * - Price: slug, type, unitPrice, intervalUnit, intervalCount, trialPeriodDays,
 *          usageEventsPerUnit, usageMeterSlug
 *
 * @param existingDefault - The existing default product
 * @param proposedDefault - The proposed default product
 * @returns true if any protected fields differ, false otherwise
 */
export const hasProtectedFieldChanges = (
  existingDefault: SetupPricingModelProductInput,
  proposedDefault: SetupPricingModelProductInput
): boolean => {
  // Check protected product fields
  const protectedProductFields = [
    'slug',
    'active',
    'default',
  ] as const
  for (const field of protectedProductFields) {
    const existingValue = existingDefault.product[field]
    const proposedValue = proposedDefault.product[field]
    if (!R.equals(existingValue, proposedValue)) {
      return true
    }
  }

  // Check protected price fields
  const protectedPriceFields = [
    'slug',
    'type',
    'unitPrice',
    'intervalUnit',
    'intervalCount',
    'trialPeriodDays',
    'usageEventsPerUnit',
    'usageMeterSlug',
  ] as const

  for (const field of protectedPriceFields) {
    const existingValue = (
      existingDefault.price as Record<string, unknown>
    )[field]
    const proposedValue = (
      proposedDefault.price as Record<string, unknown>
    )[field]
    if (!R.equals(existingValue, proposedValue)) {
      return true
    }
  }

  return false
}

/**
 * Merges the existing default product with allowed changes from the proposed default product.
 *
 * This function takes the existing default product as a base and applies only the
 * allowed field changes (name, description, features) from the proposed default.
 *
 * @param existingDefault - The existing default product
 * @param proposedDefault - The proposed default product with potential changes
 * @returns A merged product that preserves protected fields from existing while applying allowed changes
 */
export const mergeDefaultProduct = (
  existingDefault: SetupPricingModelProductInput,
  proposedDefault: SetupPricingModelProductInput
): SetupPricingModelProductInput => {
  return {
    // Use existing product as base, but apply allowed changes from proposed
    product: {
      ...existingDefault.product,
      name: proposedDefault.product.name,
      description: proposedDefault.product.description,
    },
    // Keep existing price entirely
    price: existingDefault.price,
    // Use proposed features list (features are allowed to change)
    features: proposedDefault.features,
  }
}

/**
 * Protects the default product from invalid modifications during pricing model updates.
 *
 * This function ensures that the default product cannot be removed or have its protected
 * fields modified. It applies the following logic:
 *
 * 1. Validates that proposed input has at most one default product (returns error if multiple)
 * 2. If proposed has no default product:
 *    a. If proposed contains a product with the same slug as existing default (demotion attempt),
 *       route through merge path to preserve default: true
 *    b. Otherwise, add back the existing default
 * 3. If proposed has a default product but with protected field changes,
 *    merges the existing default with only the allowed changes (name, description, features)
 *
 * @param existingInput - The existing pricing model setup
 * @param proposedInput - The proposed pricing model setup
 * @returns Result with modified proposed input on success, ValidationError on failure
 */
export const protectDefaultProduct = (
  existingInput: SetupPricingModelInput,
  proposedInput: SetupPricingModelInput
): Result<SetupPricingModelInput, ValidationError> => {
  // Step 1: Validate no multiple defaults in proposed
  const validationResult = validateSingleDefaultProduct(proposedInput)
  if (Result.isError(validationResult)) {
    return Result.err(validationResult.error)
  }

  // Step 2: Find existing and proposed default products
  const existingDefault = findDefaultProduct(existingInput)
  const proposedDefault = findDefaultProduct(proposedInput)

  // If no existing default, return error
  if (!existingDefault) {
    return Result.err(
      new ValidationError(
        'products',
        'No default product found in existing input'
      )
    )
  }

  // Step 3: If proposed has no default product
  if (!proposedDefault) {
    // Check if proposed contains the existing default product with default: false (demotion attempt)
    const demotedDefault = findProductBySlug(
      proposedInput,
      existingDefault.product.slug
    )

    if (demotedDefault) {
      // Route through merge path: preserve default: true and other protected fields,
      // but apply allowed changes (name, description, features)
      const mergedDefault = mergeDefaultProduct(
        existingDefault,
        demotedDefault
      )

      // Replace the demoted product with the merged version
      const updatedProducts = proposedInput.products.map((p) =>
        p.product.slug === existingDefault.product.slug
          ? mergedDefault
          : p
      )

      return Result.ok({
        ...proposedInput,
        products: updatedProducts,
      })
    }

    // No demoted default found, simply add back the existing default
    return Result.ok({
      ...proposedInput,
      products: [...proposedInput.products, existingDefault],
    })
  }

  // Step 4: Proposed has a default product - check for protected field changes
  if (hasProtectedFieldChanges(existingDefault, proposedDefault)) {
    // Merge: use existing default as base, apply only allowed changes
    const mergedDefault = mergeDefaultProduct(
      existingDefault,
      proposedDefault
    )

    // Replace the proposed default product with the merged version
    const updatedProducts = proposedInput.products.map((p) =>
      p.product.default === true ? mergedDefault : p
    )

    return Result.ok({
      ...proposedInput,
      products: updatedProducts,
    })
  }

  // No protected changes detected, return proposed as-is
  return Result.ok(proposedInput)
}
