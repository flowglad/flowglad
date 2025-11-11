import type {
  BillingWithChecks,
  SubscriptionExperimentalFields,
} from '@flowglad/shared';
import type { Price } from '@flowglad/types';

type UsageMeterSlug = 'fast_generations' | 'hd_video_minutes';

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
  currentSubscription:
    | NonNullable<
        NonNullable<BillingWithChecks['currentSubscriptions']>[number]
      >
    | undefined,
  pricingModel: BillingWithChecks['pricingModel'] | undefined
): number {
  try {
    // Early returns if we don't have the necessary data
    if (!currentSubscription || !pricingModel?.usageMeters) return 0;

    // Get feature items from subscription (stored in experimental.featureItems)
    const experimental = currentSubscription.experimental;
    const featureItems = experimental?.featureItems ?? [];

    if (featureItems.length === 0) return 0;

    // Build a lookup map: usageMeterId -> slug
    // (Feature items reference meters by ID, but we need to match by slug)
    const usageMeterById: Record<string, string> = {};
    for (const meter of pricingModel.usageMeters) {
      const meterId = String(meter.id);
      const meterSlug = String(meter.slug);
      usageMeterById[meterId] = meterSlug;
    }

    // Filter to only usage credit grant features that match our slug
    let total = 0;
    for (const item of featureItems) {
      // Only process usage credit grants (not toggle features)
      if (item.type !== 'usage_credit_grant') continue;

      // Check if this feature item's meter matches the slug we're looking for
      const meterSlug = usageMeterById[item.usageMeterId];
      if (meterSlug === usageMeterSlug) {
        total += item.amount;
      }
    }

    return total;
  } catch {
    return 0;
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
  pricingModel: BillingWithChecks['pricingModel'] | undefined
): { id: string; slug: string } | null {
  if (!pricingModel?.usageMeters) return null;

  const usageMeter = pricingModel.usageMeters.find(
    (meter) => meter.slug === usageMeterSlug
  );

  if (!usageMeter) {
    return null;
  }

  return {
    id: String(usageMeter.id),
    slug: String(usageMeter.slug),
  };
}

/**
 * Finds a usage price by its associated usage meter ID from the pricing model.
 *
 * @param usageMeterId - The ID of the usage meter to find the price for
 * @param pricingModel - The billing pricing model (from billing.pricingModel)
 * @returns The usage price object, or null if not found
 */
export function findUsagePriceByMeterId(
  usageMeterId: string,
  pricingModel: BillingWithChecks['pricingModel'] | undefined
): Price | null {
  if (!pricingModel?.products) return null;

  const usagePrice = pricingModel.products
    .flatMap((product) => product.prices ?? [])
    .find(
      (price) => price.type === 'usage' && price.usageMeterId === usageMeterId
    );

  return usagePrice ?? null;
}
