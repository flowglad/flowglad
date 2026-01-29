import type { PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { Result } from 'better-result'
import * as R from 'ramda'
import { ValidationError } from '@/errors'

/**
 * Fields that can be updated on default products
 */
export const DEFAULT_PRODUCT_ALLOWED_FIELDS = [
  'name',
  'displayFeatures',
  'description',
  'imageURL',
  'active',
] as const

/**
 * Validates that only allowed fields are being updated on a default product
 */
export const validateDefaultProductUpdate = (
  update: Partial<Product.Update>,
  existingProduct: Product.Record
): Result<void, ValidationError> => {
  // Prevent changing the default status on any product
  if (
    'default' in update &&
    update.default !== existingProduct.default
  ) {
    return Result.err(
      new ValidationError(
        'product.default',
        'Cannot change the default status of a product'
      )
    )
  }

  // If not a default product, no further validation needed
  if (!existingProduct.default) return Result.ok(undefined)

  // Force default products to remain active
  if ('active' in update && update.active === false) {
    return Result.err(
      new ValidationError(
        'product.active',
        'Default products must remain active'
      )
    )
  }

  const attemptedFields = Object.keys(update).filter(
    (k) => k !== 'id' && k !== 'default'
  )
  // Only consider fields that are actually changing
  const changedFields = attemptedFields.filter((fieldName) => {
    const nextVal = (update as any)[fieldName]
    const prevVal = (existingProduct as any)[fieldName]
    // Treat null and undefined as equivalent to avoid false positives
    const bothNullish = nextVal == null && prevVal == null
    if (bothNullish) return false
    return !R.equals(nextVal, prevVal)
  })

  const disallowedChangedFields = changedFields.filter(
    (f) => !DEFAULT_PRODUCT_ALLOWED_FIELDS.includes(f as any)
  )

  if (disallowedChangedFields.length > 0) {
    return Result.err(
      new ValidationError(
        'product',
        `Cannot update the following fields on default products: ${disallowedChangedFields.join(', ')}. Only ${DEFAULT_PRODUCT_ALLOWED_FIELDS.join(', ')} can be modified.`
      )
    )
  }

  // Additionally, prevent slug change on default products
  if (
    'slug' in update &&
    update.slug !== undefined &&
    update.slug !== existingProduct.slug &&
    existingProduct.default
  ) {
    return Result.err(
      new ValidationError(
        'product.slug',
        'Cannot change the slug of a default product'
      )
    )
  }

  return Result.ok(undefined)
}

/**
 * Validates that default prices maintain their constraints
 */
export const validateDefaultPriceUpdate = (
  update: Partial<Price.Update>,
  existingPrice: Price.Record,
  product: Product.Record
): Result<void, ValidationError> => {
  // Only validate if this is a default price for a default product
  if (!product.default || !existingPrice.isDefault)
    return Result.ok(undefined)

  // Ensure unitPrice remains 0 for default prices on default products
  if (update.unitPrice !== undefined && update.unitPrice !== 0) {
    return Result.err(
      new ValidationError(
        'price.unitPrice',
        'Default prices for default products must have a unitPrice of 0'
      )
    )
  }

  // Disallow trials on default product's default price
  if (
    update.trialPeriodDays !== undefined &&
    update.trialPeriodDays !== null &&
    update.trialPeriodDays !== 0
  ) {
    return Result.err(
      new ValidationError(
        'price.trialPeriodDays',
        'Default prices for default products cannot have a time-based trial'
      )
    )
  }

  // Prevent changing the billing interval for default prices on default products
  if (
    update.intervalUnit !== undefined &&
    update.intervalUnit !== existingPrice.intervalUnit
  ) {
    return Result.err(
      new ValidationError(
        'price.intervalUnit',
        'Cannot change the billing interval of the default price for a default product'
      )
    )
  }

  // Prevent changing the isDefault status
  if (
    'isDefault' in update &&
    update.isDefault !== existingPrice.isDefault
  ) {
    return Result.err(
      new ValidationError(
        'price.isDefault',
        'Cannot change the default status of a default price on a default product'
      )
    )
  }

  return Result.ok(undefined)
}

/**
 * Validates that a product creation request is not trying to create a default product
 */
export const validateProductCreation = (
  product: Partial<Product.Insert>
): Result<void, ValidationError> => {
  if (product.default === true) {
    return Result.err(
      new ValidationError(
        'product.default',
        'Default products cannot be created manually. They are automatically created when pricing models are created.'
      )
    )
  }
  return Result.ok(undefined)
}
/**
 * Checks if a field update on a default product is allowed
 */
export const isDefaultProductFieldUpdateAllowed = (
  fieldName: string
): boolean => {
  return DEFAULT_PRODUCT_ALLOWED_FIELDS.includes(fieldName as any)
}

/**
 * Validates that a product is a valid default product
 * Default products must have a price with amount 0
 */
export const validateDefaultProductSchema = (product: {
  name: string
  slug?: string
  price: {
    amount: number
    type: PriceType
    slug?: string
    trialDays?: number
  }
}): Result<void, ValidationError> => {
  // Check price is zero
  if (product.price.amount !== 0) {
    return Result.err(
      new ValidationError(
        'price.amount',
        'Default products must have zero price'
      )
    )
  }

  // Check no trials
  if (product.price.trialDays && product.price.trialDays > 0) {
    return Result.err(
      new ValidationError(
        'price.trialDays',
        'Default products cannot have trials'
      )
    )
  }

  return Result.ok(undefined)
}
