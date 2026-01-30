/**
 * Shared utilities for generating slugs in pricing model operations.
 *
 * This module provides centralized slug generation logic to ensure consistency
 * between diffing and ID resolution operations.
 */

import type { CurrencyCode, IntervalUnit } from '@db-core/enums'

/**
 * Fields required from a usage price to generate a synthetic slug.
 * This interface is compatible with both Price.UsageRecord and SetupUsageMeterPriceInput.
 */
export interface SyntheticUsagePriceSlugInput {
  unitPrice: number
  usageEventsPerUnit: number
  currency?: CurrencyCode | null
  intervalCount?: number | null
  intervalUnit?: IntervalUnit | null
}

/**
 * Builds a synthetic slug for a usage price that doesn't have a real slug.
 *
 * This function is the single source of truth for synthetic slug generation,
 * used by both diffing.ts and updateHelpers.ts to ensure consistent lookups.
 *
 * The slug is constructed from immutable price fields to ensure uniqueness
 * and consistency. Mutable fields like `name` are intentionally excluded
 * because including them would cause price updates (name change only) to be
 * treated as replacements (delete + create) instead of updates.
 *
 * The meter slug is included to ensure global uniqueness across all usage meters,
 * since resolveExistingIds builds a global price map where identical prices from
 * different meters would otherwise collide.
 *
 * @param price - The usage price fields needed for slug generation
 * @param meterSlug - The usage meter slug (for global uniqueness)
 * @returns A synthetic slug string prefixed with `__generated__`
 *
 * @example
 * ```typescript
 * const slug = buildSyntheticUsagePriceSlug(
 *   { unitPrice: 10, usageEventsPerUnit: 100, currency: 'USD', intervalCount: 1, intervalUnit: 'month' },
 *   'api-calls'
 * )
 * // Returns: '__generated__api-calls_10_100_USD_1_month'
 * ```
 */
export const buildSyntheticUsagePriceSlug = (
  price: SyntheticUsagePriceSlugInput,
  meterSlug: string
): string => {
  const currency = price.currency ?? 'USD'
  const intervalCount = price.intervalCount ?? 1
  const intervalUnit = price.intervalUnit ?? 'month'
  return `__generated__${meterSlug}_${price.unitPrice}_${price.usageEventsPerUnit}_${currency}_${intervalCount}_${intervalUnit}`
}
