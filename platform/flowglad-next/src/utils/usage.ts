import type { Price } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  bulkInsertPrices,
  safelyInsertPrice,
} from '@/db/tableMethods/priceMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import type { AuthenticatedTransactionParams } from '@/db/types'
import { IntervalUnit, PriceType } from '@/types'
import { createNoChargePriceInsert } from '@/utils/usage/noChargePriceHelpers'

/** Price fields used in usage meter creation/updates */
type UsageMeterPriceFields = {
  type?: PriceType
  unitPrice?: number
  usageEventsPerUnit?: number
}

/**
 * Creates a usage meter along with a corresponding usage price and no charge fallback price.
 * The price will have the same slug as the usage meter and have productId: null.
 * The price defaults to $0.00 per usage event unless custom price values are provided.
 *
 * A no charge price (with slug `{meterSlug}_no_charge`) is always created as a fallback.
 * If user provides price values, that price becomes the default and no_charge is non-default.
 * If user doesn't provide price values, only the no_charge price is created as the default.
 *
 * Note: Usage prices don't belong to products - they belong directly to usage meters.
 */
export const createUsageMeterTransaction = async (
  payload: {
    usageMeter: UsageMeter.ClientInsert
    price?: UsageMeterPriceFields
  },
  {
    transaction,
    livemode,
    organizationId,
  }: AuthenticatedTransactionParams
): Promise<{
  usageMeter: UsageMeter.Record
  price: Price.Record
  noChargePrice: Price.Record
}> => {
  if (!organizationId) {
    throw new Error(
      'organizationId is required to create a usage meter'
    )
  }

  const { usageMeter: usageMeterInput, price: priceInput } = payload

  // Get organization's default currency
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )

  const usageMeter = await insertUsageMeter(
    {
      ...usageMeterInput,
      organizationId,
      livemode,
    },
    transaction
  )

  // Determine if user specified custom price values
  // If they did, that price becomes default; otherwise no_charge is default
  const hasUserSpecifiedPrice =
    priceInput?.unitPrice !== undefined ||
    priceInput?.usageEventsPerUnit !== undefined

  // Use provided price values or defaults
  const unitPrice = priceInput?.unitPrice ?? 0
  const usageEventsPerUnit = priceInput?.usageEventsPerUnit ?? 1

  // Create no charge price for the meter
  // This is the fallback default price for usage events
  const noChargePriceInsert = {
    ...createNoChargePriceInsert(usageMeter, {
      currency: organization.defaultCurrency,
    }),
    // no_charge is default only if user didn't specify custom price values
    isDefault: !hasUserSpecifiedPrice,
  }

  // Create user's price if they specified custom values
  // Otherwise, only the no_charge price is needed
  const priceInserts: Price.Insert[] = [noChargePriceInsert]

  if (hasUserSpecifiedPrice) {
    priceInserts.unshift({
      type: PriceType.Usage,
      name: usageMeter.name,
      slug: usageMeter.slug,
      productId: null,
      pricingModelId: usageMeter.pricingModelId,
      usageMeterId: usageMeter.id,
      unitPrice,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      usageEventsPerUnit,
      trialPeriodDays: null,
      livemode,
      currency: organization.defaultCurrency,
      isDefault: true, // User's price is default when specified
      active: true,
      externalId: null,
    })
  }

  const insertedPrices = await bulkInsertPrices(
    priceInserts,
    transaction
  )

  // Find the user's price (first one if specified) and no_charge price (last one)
  const price = hasUserSpecifiedPrice
    ? insertedPrices[0]
    : insertedPrices[0]
  const noChargePrice = hasUserSpecifiedPrice
    ? insertedPrices[1]
    : insertedPrices[0]

  return {
    usageMeter,
    price,
    noChargePrice,
  }
}
