import { PriceType } from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import { formatBillingPeriod, getCurrencyParts } from '@/utils/stripe'

/**
 * Get the display text for product status.
 * Default products show "Default plan", others show "Active" or "Inactive".
 */
export function getProductStatusText(
  product: Pick<Product.ClientRecord, 'default' | 'active'>
): string {
  if (product.default) {
    return 'Default plan'
  }
  return product.active ? 'Active' : 'Inactive'
}

/**
 * Get the default price from a product's prices array.
 * Returns the price with isDefault=true, or the first price as fallback.
 */
export function getDefaultPrice(
  prices: Price.ClientRecord[]
): Price.ClientRecord | null {
  if (prices.length === 0) return null
  return prices.find((p) => p.isDefault) ?? prices[0]
}

/**
 * Format price data for ProductCard display.
 * - Usage-based prices show "unit" instead of the billing period.
 * - One-time/single payment prices hide the period entirely.
 */
export function formatProductCardPrice(price: Price.ClientRecord): {
  price: string
  period: string
  currencySymbol: string
} {
  const { symbol, value } = getCurrencyParts(
    price.currency,
    price.unitPrice,
    { hideZeroCents: true }
  )

  // Determine the period based on price type
  let period: string
  if (price.type === PriceType.Usage) {
    // Usage-based prices show "unit"
    period = 'unit'
  } else if (price.type === PriceType.SinglePayment) {
    // One-time prices hide the period entirely
    period = ''
  } else {
    // Subscription prices show the billing period
    period = formatBillingPeriod(
      price.intervalUnit,
      price.intervalCount
    )
  }

  return {
    price: value,
    period,
    currencySymbol: symbol,
  }
}
