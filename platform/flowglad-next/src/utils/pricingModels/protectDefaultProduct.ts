/**
 * Default product protection for pricing model updates.
 *
 * This module provides functions to protect the default product from invalid modifications
 * during pricing model updates. The default product has special constraints - only certain
 * fields (name, description, features) can be modified, while other fields (slug, price,
 * active status, etc.) are protected.
 */

import * as R from 'ramda'
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
 * A default product is identified by `product.isDefault === true`.
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
 * Validates that the proposed input doesn't have multiple default products.
 *
 * @param proposedInput - The proposed pricing model input
 * @throws Error if more than one product has isDefault=true
 */
export const validateSingleDefaultProduct = (
  proposedInput: SetupPricingModelInput
): void => {
  const defaultProducts = proposedInput.products.filter(
    (p) => p.product.default === true
  )

  if (defaultProducts.length > 1) {
    const slugs = defaultProducts
      .map((p) => p.product.slug)
      .join(', ')
    throw new Error(
      `Only one product can be marked as default. Found ${defaultProducts.length} default products: ${slugs}`
    )
  }
}

/**
 * Checks if the proposed default product has any protected field changes
 * compared to the existing default product.
 *
 * Protected fields include:
 * - Product: slug, active, isDefault
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
 * Finds a product by its slug in a pricing model input.
 *
 * @param input - The pricing model setup input
 * @param slug - The product slug to find
 * @returns The product input with matching slug, or undefined if not found
 */
export const findProductBySlug = (
  input: SetupPricingModelInput,
  slug: string
): SetupPricingModelProductInput | undefined => {
  return input.products.find((p) => p.product.slug === slug)
}

/**
 * Protects the default product from invalid modifications during pricing model updates.
 *
 * This function ensures that the default product cannot be removed or have its protected
 * fields modified. It applies the following logic:
 *
 * 1. Validates that proposed input has at most one default product (throws if multiple)
 * 2. If the existing default product is missing from proposed (by slug), adds it back
 * 3. If the existing default product exists in proposed but has protected field changes,
 *    merges the existing default with only the allowed changes (name, description, features)
 *
 * Note: If someone tries to make a different product the default (by setting isDefault=true
 * on another product while removing the original default), this function will add the
 * original default back. The result may have two products with isDefault=true, which
 * should be caught by subsequent validation.
 *
 * @param existingInput - The existing pricing model setup
 * @param proposedInput - The proposed pricing model setup
 * @returns A modified proposed input with the default product protected
 * @throws Error if proposed input has multiple default products
 */
export const protectDefaultProduct = (
  existingInput: SetupPricingModelInput,
  proposedInput: SetupPricingModelInput
): SetupPricingModelInput => {
  // Step 1: Validate no multiple defaults in proposed
  validateSingleDefaultProduct(proposedInput)

  // Step 2: Find existing default product
  const existingDefault = findDefaultProduct(existingInput)

  // If no existing default, nothing to protect
  if (!existingDefault) {
    return proposedInput
  }

  // Step 3: Find the existing default product in proposed by its slug
  // (not by isDefault flag, because someone might try to change which product is default)
  const proposedDefaultBySlug = findProductBySlug(
    proposedInput,
    existingDefault.product.slug
  )

  // Step 4: If the existing default product is missing from proposed (by slug), add it back
  if (!proposedDefaultBySlug) {
    return {
      ...proposedInput,
      products: [...proposedInput.products, existingDefault],
    }
  }

  // Step 5: The existing default product exists in proposed - check for protected field changes
  if (
    hasProtectedFieldChanges(existingDefault, proposedDefaultBySlug)
  ) {
    // Merge: use existing default as base, apply only allowed changes
    const mergedDefault = mergeDefaultProduct(
      existingDefault,
      proposedDefaultBySlug
    )

    // Replace the proposed product (matched by slug) with the merged version
    const updatedProducts = proposedInput.products.map((p) =>
      p.product.slug === existingDefault.product.slug
        ? mergedDefault
        : p
    )

    return {
      ...proposedInput,
      products: updatedProducts,
    }
  }

  // No protected changes detected, return proposed as-is
  return proposedInput
}
