import { PriceType } from '@db-core/enums'
import { Price } from '@db-core/schema/prices'
import { TRPCError } from '@trpc/server'

/**
 * Raw input type for price validation before Zod transforms.
 * This type explicitly allows productId to be string | null | undefined
 * to enable validation of raw API input.
 */
type RawPriceInput = {
  type: PriceType
  productId?: string | null
}

/**
 * Helper function to extract raw productId value from a price input.
 * Works with both parsed Price.ClientInsert and raw input objects.
 */
const getRawProductId = (
  price: Price.ClientInsert | RawPriceInput
): string | null | undefined => {
  // Access productId from the object, handling the discriminated union
  // by checking if the property exists on the raw object
  return 'productId' in price
    ? (price.productId as string | null | undefined)
    : undefined
}

/**
 * Validates that a price insert has the correct productId based on its type.
 * - Usage prices: productId must be null/undefined
 * - Subscription/SinglePayment prices: productId must be a string
 *
 * This is a pure function that can be unit tested without database dependencies.
 *
 * NOTE: The v1 Zod schema coerces usage price productId to null before this runs,
 * so the "usage prices cannot have productId" error is currently unreachable via
 * normal API paths. This validation will become active when:
 * 1. We switch to v2 strict Zod schema (productId: z.null() instead of coercion)
 * 2. Raw input bypasses Zod parsing (edge cases, internal calls)
 *
 * @param price - The price insert to validate (raw or parsed)
 * @throws TRPCError with code BAD_REQUEST if validation fails
 */
export const validatePriceTypeProductIdConsistency = (
  price: Price.ClientInsert | RawPriceInput
): void => {
  const productId = getRawProductId(price)

  // For usage prices, productId must be null or undefined (not a valid string).
  // NOTE: With v1 Zod coercion, this branch is unreachable via normal API paths
  // since Zod transforms productId to null. This is intentional for backward
  // compatibility. The validation will activate when we deploy v2 strict schema.
  if (
    price.type === PriceType.Usage &&
    productId !== null &&
    productId !== undefined
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Usage prices cannot have a productId. They belong to usage meters.',
    })
  }

  // For subscription/single payment prices, productId must be a non-empty string.
  if (
    price.type !== PriceType.Usage &&
    (!productId || productId.trim() === '')
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
