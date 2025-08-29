import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { TRPCError } from '@trpc/server'

/**
 * Fields that can be updated on default products
 */
export const DEFAULT_PRODUCT_ALLOWED_FIELDS = [
  'name',
  'slug',
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
  if (!existingProduct.default) return

  const attemptedFields = Object.keys(update).filter(k => k !== 'id')
  const disallowedFields = attemptedFields.filter(
    f => !DEFAULT_PRODUCT_ALLOWED_FIELDS.includes(f as any)
  )

  if (disallowedFields.length > 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Cannot update the following fields on default products: ${disallowedFields.join(', ')}. Only ${DEFAULT_PRODUCT_ALLOWED_FIELDS.join(', ')} can be modified.`,
    })
  }

  // Prevent changing the default status
  if ('default' in update && update.default !== existingProduct.default) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot change the default status of a product',
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
      message: 'Default prices for default products must have a unitPrice of 0',
    })
  }

  // Prevent changing the isDefault status
  if ('isDefault' in update && update.isDefault !== existingPrice.isDefault) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot change the default status of a default price on a default product',
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
      message: 'Default products cannot be created manually. They are automatically created when pricing models are created.',
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