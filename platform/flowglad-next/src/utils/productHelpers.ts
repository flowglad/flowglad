import { PriceType } from '@/types'

/**
 * Filters products to only include those available for subscription creation.
 *
 * A product is available if:
 * - It is not a default product
 * - It has at least one active price
 * - Its default price is active and of subscription type
 *
 * @param products - Array of products with prices
 * @returns Filtered array of available subscription products
 */
export const filterAvailableSubscriptionProducts = <
  T extends {
    id: string
    name: string
    default: boolean
    prices: Array<{ id: string; active: boolean; type: PriceType }>
    defaultPrice: { id: string; active: boolean; type: PriceType }
  },
>(
  products: T[]
): T[] => {
  return products.filter(
    (product) =>
      !product.default &&
      product.prices.length > 0 &&
      product.defaultPrice.active &&
      product.defaultPrice.type === PriceType.Subscription
  )
}
