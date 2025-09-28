import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { TRPCError } from '@trpc/server'
import * as R from 'ramda'
import { PriceType } from '@/types'
import { createDefaultPlanConfig } from '@/constants/defaultPlanConfig'

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
): void => {
  // Prevent changing the default status on any product
  if (
    'default' in update &&
    update.default !== existingProduct.default
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot change the default status of a product',
    })
  }

  // If not a default product, no further validation needed
  if (!existingProduct.default) return

  // Force default products to remain active
  if ('active' in update && update.active === false) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Default products must remain active',
    })
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
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Cannot update the following fields on default products: ${disallowedChangedFields.join(', ')}. Only ${DEFAULT_PRODUCT_ALLOWED_FIELDS.join(', ')} can be modified.`,
    })
  }

  // Additionally, prevent slug change on default products
  if (
    'slug' in update &&
    update.slug !== undefined &&
    update.slug !== existingProduct.slug &&
    existingProduct.default
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot change the slug of a default product',
    })
  }
}

/**
 * Validates that default prices maintain their constraints
 */
export const validateDefaultPriceUpdate = (
  update: Partial<Price.Update>,
  existingPrice: Price.Record,
  product: Product.Record
): void => {
  // Only validate if this is a default price for a default product
  if (!product.default || !existingPrice.isDefault) return

  // Ensure unitPrice remains 0 for default prices on default products
  if (update.unitPrice !== undefined && update.unitPrice !== 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Default prices for default products must have a unitPrice of 0',
    })
  }

  // Disallow trials on default product's default price
  if (
    update.trialPeriodDays !== undefined &&
    update.trialPeriodDays !== null &&
    update.trialPeriodDays !== 0
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Default prices for default products cannot have a time-based trial',
    })
  }
  if (
    update.startsWithCreditTrial !== undefined &&
    update.startsWithCreditTrial !== null &&
    update.startsWithCreditTrial !== false
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Default prices for default products cannot start with a credit trial',
    })
  }

  // Prevent changing the billing interval for default prices on default products
  if (
    update.intervalUnit !== undefined &&
    update.intervalUnit !== existingPrice.intervalUnit
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Cannot change the billing interval of the default price for a default product',
    })
  }

  // Prevent changing the isDefault status
  if (
    'isDefault' in update &&
    update.isDefault !== existingPrice.isDefault
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Cannot change the default status of a default price on a default product',
    })
  }
}

/**
 * Validates that a product creation request is not trying to create a default product
 */
export const validateProductCreation = (
  product: Partial<Product.Insert>
): void => {
  if (product.default === true) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Default products cannot be created manually. They are automatically created when pricing models are created.',
    })
  }
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
 * Default products must have exactly one price with amount 0
 */
export const validateDefaultProductSchema = (product: {
  name: string
  slug?: string
  prices: Array<{
    amount: number
    type: PriceType
    slug?: string
    trialDays?: number
    setupFee?: number
  }>
}) => {
  // Exactly one price and it must be the default price
  if (!product.prices || product.prices.length !== 1) {
    throw new Error('Default products must have exactly one price')
  }
  const price = product.prices[0]

  // Check price is zero
  if (price.amount !== 0) {
    throw new Error('Default products must have zero price')
  }

  // Check no trials
  if (price.trialDays && price.trialDays > 0) {
    throw new Error('Default products cannot have trials')
  }

  // Check no setup fees
  if (price.setupFee && price.setupFee > 0) {
    throw new Error('Default products cannot have setup fees')
  }

  // Check reserved slug usage
  if (product.slug === 'free') {
    throw new Error(
      "Slug 'free' is reserved for auto-generated default plans"
    )
  }
}
