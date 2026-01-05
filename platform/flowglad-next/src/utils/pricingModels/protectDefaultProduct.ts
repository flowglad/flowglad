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
 * Protects the default product from invalid modifications during pricing model updates.
 *
 * This function ensures that the default product cannot be removed or have its protected
 * fields modified. It applies the following logic:
 *
 * 1. Validates that proposed input has at most one default product (throws if multiple)
 * 2. If proposed has no default product, adds back the existing default
 * 3. If proposed has a default product but with protected field changes,
 *    merges the existing default with only the allowed changes (name, description, features)
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

  // Step 2: Find existing and proposed default products
  const existingDefault = findDefaultProduct(existingInput)
  const proposedDefault = findDefaultProduct(proposedInput)

  // If no existing default, throw error
  if (!existingDefault) {
    throw new Error('No default product found in existing input')
  }

  // Step 3: If proposed has no default product, add back the existing default
  if (!proposedDefault) {
    return {
      ...proposedInput,
      products: [...proposedInput.products, existingDefault],
    }
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

    return {
      ...proposedInput,
      products: updatedProducts,
    }
  }

  // No protected changes detected, return proposed as-is
  return proposedInput
}
