import type {
  Price,
  PricingModel,
  SubscriptionDetails,
  UsageMeter,
} from '@flowglad/nextjs'

type UsageMeterSlug = 'fast_generations' | 'hd_video_minutes'

/**
 * Computes the total usage credits for a given usage meter slug from the current subscription's feature items.
 *
 * This function extracts usage credit grants from the subscription's experimental.featureItems
 * and sums up the amounts for the specified usage meter.
 *
 * @param usageMeterSlug - The slug of the usage meter to compute totals for
 * @param currentSubscription - The current subscription object (from billing.currentSubscriptions[0])
 * @param pricingModel - The billing pricing model (from billing.pricingModel)
 * @returns The total amount of usage credits for the specified meter, or 0 if not found
 */
export function computeUsageTotal(
  usageMeterSlug: UsageMeterSlug,
  currentSubscription: SubscriptionDetails | undefined,
  pricingModel: PricingModel | null | undefined
): number {
  try {
    // Early returns if we don't have the necessary data
    if (!currentSubscription || !pricingModel?.usageMeters) return 0

    // Get feature items from subscription (stored in experimental.featureItems)
    const experimental = currentSubscription.experimental
    const featureItems = experimental?.featureItems ?? []

    if (featureItems.length === 0) return 0

    // Build a lookup map: usageMeterId -> slug
    // (Feature items reference meters by ID, but we need to match by slug)
    const usageMeterById: Record<string, string> = {}
    for (const meter of pricingModel.usageMeters) {
      const meterId = String(meter.id)
      const meterSlug = String(meter.slug)
      usageMeterById[meterId] = meterSlug
    }

    // Filter to only usage credit grant features that match our slug
    let total = 0
    for (const item of featureItems) {
      // Only process usage credit grants (not toggle features)
      if (item.type !== 'usage_credit_grant') continue

      // Check if this feature item's meter matches the slug we're looking for
      const meterSlug = usageMeterById[item.usageMeterId]
      if (meterSlug === usageMeterSlug) {
        total += item.amount
      }
    }

    return total
  } catch {
    return 0
  }
}

/**
 * Finds a usage meter by its slug from the pricing model.
 *
 * @param usageMeterSlug - The slug of the usage meter to find
 * @param pricingModel - The billing pricing model (from billing.pricingModel)
 * @returns The usage meter object with id and slug, or null if not found
 */
export function findUsageMeterBySlug(
  usageMeterSlug: string,
  pricingModel: PricingModel | null | undefined
): { id: string; slug: string } | null {
  if (!pricingModel?.usageMeters) return null

  const usageMeter = pricingModel.usageMeters.find(
    (meter: UsageMeter) => meter.slug === usageMeterSlug
  )

  if (!usageMeter) {
    return null
  }

  return {
    id: String(usageMeter.id),
    slug: String(usageMeter.slug),
  }
}

/**
 * Finds a usage price by its associated usage meter slug from the pricing model.
 * Usage prices are now nested under usageMeters[].prices (not products[].prices).
 *
 * @param usageMeterSlug - The slug of the usage meter to find the price for
 * @param pricingModel - The billing pricing model (from billing.pricingModel)
 * @returns The usage price object, or null if not found
 */
export function findUsagePriceByMeterSlug(
  usageMeterSlug: string,
  pricingModel: PricingModel | null | undefined
): Price | null {
  if (!pricingModel?.usageMeters) return null

  // Find the usage meter by slug
  const usageMeter = pricingModel.usageMeters.find(
    (meter: UsageMeter) => meter.slug === usageMeterSlug
  )
  if (!usageMeter) return null

  // Usage prices are now directly on the usage meter
  // Cast to access the prices property which is part of the new schema
  const meterWithPrices = usageMeter as UsageMeter & {
    prices?: Price[]
  }
  const usagePrice = meterWithPrices.prices?.find(
    (price: Price) => price.type === 'usage'
  )

  return usagePrice ?? null
}

/**
 * Checks if a plan is a default plan by looking up the price by slug.
 * Default plans have default: true at the product level.
 *
 * @param pricingModel - The billing pricing model (from billing.pricingModel)
 * @param priceSlug - The slug of the price to check
 * @returns true if the plan is a default plan, false otherwise
 */
export function isDefaultPlanBySlug(
  pricingModel: PricingModel | null | undefined,
  priceSlug: string | undefined
): boolean {
  if (!pricingModel?.products || !priceSlug) return false

  for (const product of pricingModel.products) {
    const price = product.prices?.find(
      (p: Price) => p.slug === priceSlug
    )
    if (price) {
      // Check if the product is default (e.g., Free Plan)
      return product.default === true
    }
  }
  return false
}

/**
 * Creates a usage event by calling the Flowglad API directly.
 * This replaces the useBilling().createUsageEvent pattern with a direct API call.
 *
 * @param params - The usage event parameters
 * @param params.usageMeterSlug - The slug of the usage meter
 * @param params.amount - The amount to record
 * @param params.transactionId - Optional transaction ID for idempotency
 * @returns The created usage event or an error
 */
export async function createUsageEvent(params: {
  usageMeterSlug: string
  amount: number
  transactionId?: string
}): Promise<
  | { usageEvent: { id: string } }
  | { error: { code: string; json: Record<string, unknown> } }
> {
  const response = await fetch(
    '/api/auth/flowglad/usage-events/create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  )

  const json = await response.json()
  if (json.error) {
    return { error: json.error }
  }
  return { usageEvent: { id: json.data.usageEvent.id } }
}
