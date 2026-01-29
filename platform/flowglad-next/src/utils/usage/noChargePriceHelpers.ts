import {
  type CurrencyCode,
  IntervalUnit,
  PriceType,
} from '@db-core/enums'
import type { Price } from '@db-core/schema/prices'
import { RESERVED_USAGE_PRICE_SLUG_SUFFIX } from '@db-core/schema/prices'
import type { UsageMeter } from '@db-core/schema/usageMeters'

/**
 * Generates the reserved no-charge price slug for a usage meter.
 * This slug follows the pattern: `{usageMeterSlug}_no_charge`
 *
 * @param usageMeterSlug - The slug of the usage meter
 * @returns The no-charge price slug
 */
export const getNoChargeSlugForMeter = (
  usageMeterSlug: string
): string => {
  return `${usageMeterSlug}${RESERVED_USAGE_PRICE_SLUG_SUFFIX}`
}

/**
 * Checks if a price slug is a no-charge price slug.
 * No-charge prices end with the reserved `_no_charge` suffix.
 *
 * @param priceSlug - The price slug to check
 * @returns true if the slug ends with `_no_charge`
 */
export const isNoChargePrice = (priceSlug: string): boolean => {
  return priceSlug.endsWith(RESERVED_USAGE_PRICE_SLUG_SUFFIX)
}

/**
 * Creates a no-charge price insert object for a usage meter.
 * This is used when auto-creating fallback prices for usage meters.
 *
 * The no-charge price has:
 * - unitPrice: 0 (always $0)
 * - usageEventsPerUnit: 1
 * - productId: null (usage prices belong to meters, not products)
 * - isDefault: false (caller decides when to set true)
 *
 * @param usageMeter - The usage meter to create a no-charge price for
 * @param params.currency - The currency for the price
 * @returns A Price.UsageInsert object ready for insertion
 */
export const createNoChargePriceInsert = (
  usageMeter: UsageMeter.Record,
  params: { currency: CurrencyCode }
): Price.UsageInsert => ({
  type: PriceType.Usage,
  name: `${usageMeter.name} - No Charge`,
  slug: getNoChargeSlugForMeter(usageMeter.slug),
  usageMeterId: usageMeter.id,
  pricingModelId: usageMeter.pricingModelId,
  productId: null,
  unitPrice: 0,
  usageEventsPerUnit: 1,
  isDefault: false, // Set to false by default; caller decides when to set true
  active: true,
  currency: params.currency,
  intervalUnit: IntervalUnit.Month,
  intervalCount: 1,
  trialPeriodDays: null,
  externalId: null,
  livemode: usageMeter.livemode,
})
