import { TRPCError } from '@trpc/server'
import { Price } from '@/db/schema/prices'
import { PriceType } from '@/types'

/**
 * Validates that a price insert has the correct productId based on its type.
 * - Usage prices: productId must be null/undefined
 * - Subscription/SinglePayment prices: productId must be a string
 *
 * This is a pure function that can be unit tested without database dependencies.
 *
 * @param price - The price insert to validate
 * @throws TRPCError with code BAD_REQUEST if validation fails
 */
export const validatePriceTypeProductIdConsistency = (
  price: Price.ClientInsert
): void => {
  // For usage prices, productId must be null or undefined (not a valid string).
  // Cast to unknown to check raw input before Zod transform coerces it to null.
  const rawPrice = price as unknown as { productId?: string | null }

  if (
    price.type === PriceType.Usage &&
    rawPrice.productId !== null &&
    rawPrice.productId !== undefined
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Usage prices cannot have a productId. They belong to usage meters.',
    })
  }

  // For subscription/single payment prices, productId must be a valid string.
  // We check the raw value since Zod transforms might not have run yet.
  if (
    price.type !== PriceType.Usage &&
    (rawPrice.productId === null || rawPrice.productId === undefined)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Subscription and single payment prices require a productId.',
    })
  }
}

/**
 * Validates product-level constraints for a price insert.
 * This is a pure function that takes pre-fetched data.
 *
 * Rules:
 * 1. Cannot create additional prices for default products (only one price allowed)
 * 2. Default prices on default products must have unitPrice = 0
 * 3. Cannot create price of a different type than existing prices for the product
 *
 * @param params.price - The price insert to validate
 * @param params.product - The product the price belongs to
 * @param params.existingPrices - Existing prices for the product
 * @throws TRPCError if validation fails
 */
export const validateProductPriceConstraints = (params: {
  price: Price.ClientInsert & { productId: string }
  product: { default: boolean }
  existingPrices: Array<{ type: PriceType }>
}): void => {
  const { price, product, existingPrices } = params

  // Forbid creating additional prices for default products
  if (product.default && existingPrices.length > 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot create additional prices for the default plan',
    })
  }

  // Default prices on default products must have unitPrice = 0
  if (price.isDefault && product.default && price.unitPrice !== 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Default prices on default products must have unitPrice = 0',
    })
  }

  // Forbid creating price of a different type
  if (
    existingPrices.length > 0 &&
    existingPrices.some(
      (existingPrice) => existingPrice.type !== price.type
    )
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Cannot create price of a different type than the existing prices for the product',
    })
  }
}
