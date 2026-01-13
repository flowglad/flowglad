import type { Price } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { type CurrencyCode, IntervalUnit, PriceType } from '@/types'

/**
 * Generates the reserved slug for a usage meter's no charge price.
 * The pattern `{usageMeterSlug}_no_charge` is reserved and cannot be used for user-created prices.
 *
 * @param usageMeterSlug - The slug of the usage meter
 * @returns The no charge price slug
 */
export const getNoChargeSlugForMeter = (
  usageMeterSlug: string
): string => {
  return `${usageMeterSlug}_no_charge`
}

/**
 * Checks if a price slug is a no charge price (ends with `_no_charge`).
 * This suffix is reserved for auto-generated fallback prices on usage meters.
 *
 * @param priceSlug - The slug to check
 * @returns true if the slug ends with `_no_charge`
 */
export const isNoChargePrice = (priceSlug: string): boolean => {
  return priceSlug.endsWith('_no_charge')
}

/**
 * Creates a Price.Insert object for a no charge price for a usage meter.
 * The no charge price is the guaranteed fallback default for a usage meter.
 *
 * @param usageMeter - The usage meter record to create the no charge price for
 * @param params - Additional parameters needed for the price insert
 * @returns The no charge price insert object
 */
export const createNoChargePriceInsert = (
  usageMeter: UsageMeter.Record,
  params: {
    currency: CurrencyCode
  }
): Price.UsageInsert => ({
  type: PriceType.Usage,
  name: `${usageMeter.name} - No Charge`,
  slug: getNoChargeSlugForMeter(usageMeter.slug),
  usageMeterId: usageMeter.id,
  pricingModelId: usageMeter.pricingModelId,
  productId: null,
  unitPrice: 0,
  usageEventsPerUnit: 1,
  isDefault: false, // Set to false; will be updated if no other default exists
  active: true,
  currency: params.currency,
  intervalUnit: IntervalUnit.Month,
  intervalCount: 1,
  trialPeriodDays: null,
  externalId: null,
  livemode: usageMeter.livemode,
})
