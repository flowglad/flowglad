import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

/**
 * Format currency amount (cents) to display string
 * @example formatCurrency(2000) => "$20.00"
 */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Get human-readable interval string
 * @example getIntervalString('month', 1) => "Monthly"
 * @example getIntervalString('year', 1) => "Yearly"
 */
export function getIntervalString(
  unit: string,
  count: number
): string {
  if (count === 1) {
    return unit === 'month'
      ? 'Monthly'
      : unit === 'year'
        ? 'Yearly'
        : `Every ${unit}`
  }
  return `Every ${count} ${unit}s`
}

/**
 * Count total objects that will be created from a template
 */
export function getTemplateCounts(input: SetupPricingModelInput) {
  const productCount = input.products.length
  const priceCount = input.products.length // Each product has one price
  const featureCount = input.features.length
  const usageMeterCount = input.usageMeters.length

  return {
    products: productCount,
    prices: priceCount,
    features: featureCount,
    usageMeters: usageMeterCount,
    total: productCount + priceCount + featureCount + usageMeterCount,
  }
}

/**
 * Generate unique name for cloned template
 * @example generateTemplateName("Usage-Limit Subscription") => "Usage-Limit Subscription"
 */
export function generateTemplateName(
  baseTemplateName: string
): string {
  return baseTemplateName
}
