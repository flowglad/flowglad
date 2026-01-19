import type { Price } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
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
 * Creates a usage meter along with a no-charge fallback price and optionally a custom price.
 *
 * Behavior:
 * - A no-charge price (slug: `{meterSlug}_no_charge`) is ALWAYS created for every usage meter
 * - If the user provides custom price values (unitPrice or usageEventsPerUnit), a custom price is also created
 * - When no custom values are provided, `price` and `noChargePrice` are the SAME object
 * - The no-charge price is the default (`isDefault: true`) only when no custom price is provided
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
    userId,
    invalidateCache,
  }: AuthenticatedTransactionParams &
    Required<Pick<AuthenticatedTransactionParams, 'invalidateCache'>>
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
  // If they did, we create both a custom price AND a no-charge price
  // If they didn't, we only create the no-charge price (which serves as both)
  const hasUserSpecifiedPrice =
    priceInput?.unitPrice !== undefined ||
    priceInput?.usageEventsPerUnit !== undefined

  // Create no_charge price insert (always created)
  const noChargePriceInsert: Price.UsageInsert = {
    ...createNoChargePriceInsert(usageMeter, {
      currency: organization.defaultCurrency,
    }),
    // No-charge is default only if no user price is specified
    isDefault: !hasUserSpecifiedPrice,
  }

  // Build price inserts array
  const priceInserts: Price.Insert[] = []

  if (hasUserSpecifiedPrice) {
    // User specified custom price values - create their custom price first
    const userPriceInsert: Price.UsageInsert = {
      type: PriceType.Usage,
      name: usageMeter.name,
      slug: usageMeter.slug,
      productId: null,
      pricingModelId: usageMeter.pricingModelId,
      usageMeterId: usageMeter.id,
      unitPrice: priceInput?.unitPrice ?? 0,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      usageEventsPerUnit: priceInput?.usageEventsPerUnit ?? 1,
      trialPeriodDays: null,
      livemode,
      currency: organization.defaultCurrency,
      externalId: null,
      isDefault: true, // User's price is the default
      active: true,
    }
    priceInserts.push(userPriceInsert)
  }

  // Always add the no-charge price
  priceInserts.push(noChargePriceInsert)

  const insertedPrices = await bulkInsertPrices(
    priceInserts,
    transaction
  )

  // Return the appropriate prices
  // When user specified custom values: first is user price, second is no-charge
  // When no custom values: only one price exists, which is the no-charge price
  const price = insertedPrices[0]
  const noChargePrice = hasUserSpecifiedPrice
    ? insertedPrices[1]
    : insertedPrices[0]

  return {
    usageMeter,
    price,
    noChargePrice,
  }
}
