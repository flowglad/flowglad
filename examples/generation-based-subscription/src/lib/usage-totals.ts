import type {
  BillingWithChecks,
  SubscriptionExperimentalFields,
} from '@flowglad/shared';

type UsageMeterSlug = 'fast_generations' | 'hd_video_minutes';

/**
 * Computes the total usage credits for a given usage meter slug from the current subscription's feature items.
 *
 * This function extracts usage credit grants from the subscription's experimental.featureItems
 * and sums up the amounts for the specified usage meter.
 *
 * @param usageMeterSlug - The slug of the usage meter to compute totals for
 * @param currentSubscription - The current subscription object (from billing.currentSubscriptions[0])
 * @param catalog - The billing catalog (from billing.catalog)
 * @returns The total amount of usage credits for the specified meter, or 0 if not found
 */
export function computeUsageTotal(
  usageMeterSlug: UsageMeterSlug,
  currentSubscription:
    | NonNullable<
        NonNullable<BillingWithChecks['currentSubscriptions']>[number]
      >
    | undefined,
  catalog: BillingWithChecks['catalog'] | undefined
): number {
  try {
    // Early returns if we don't have the necessary data
    if (!currentSubscription || !catalog?.usageMeters) return 0;

    // Get feature items from subscription (stored in experimental.featureItems)
    const experimental =
      'experimental' in currentSubscription &&
      currentSubscription.experimental &&
      typeof currentSubscription.experimental === 'object' &&
      'featureItems' in currentSubscription.experimental
        ? (currentSubscription.experimental as SubscriptionExperimentalFields)
        : null;

    const featureItems =
      experimental &&
      'featureItems' in experimental &&
      Array.isArray(experimental.featureItems)
        ? experimental.featureItems
        : [];

    if (featureItems.length === 0) return 0;

    // Build a lookup map: usageMeterId -> slug
    // (Feature items reference meters by ID, but we need to match by slug)
    const usageMeterById: Record<string, string> = {};
    for (const meter of catalog.usageMeters) {
      if ('id' in meter && 'slug' in meter) {
        const meterId =
          typeof meter.id === 'string' ? meter.id : String(meter.id);
        const meterSlug =
          typeof meter.slug === 'string' ? meter.slug : String(meter.slug);
        usageMeterById[meterId] = meterSlug;
      }
    }

    // Filter to only usage credit grant features that match our slug
    let total = 0;
    for (const item of featureItems) {
      // Only process usage credit grants (not toggle features)
      if (item?.type !== 'usage_credit_grant') continue;
      if (typeof item.usageMeterId !== 'string') continue;
      if (typeof item.amount !== 'number') continue;

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
