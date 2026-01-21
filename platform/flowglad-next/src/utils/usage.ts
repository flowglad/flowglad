import type { Price } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import {
  type AuthenticatedTransactionParams,
  noopTransactionCallbacks,
} from '@/db/types'
import { IntervalUnit, PriceType } from '@/types'
import { CacheDependency } from '@/utils/cache'
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
    userId: _userId,
    invalidateCache,
    cacheRecomputationContext,
    emitEvent,
    enqueueLedgerCommand,
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

  const ctx = {
    transaction,
    cacheRecomputationContext,
    invalidateCache,
    emitEvent: emitEvent ?? noopTransactionCallbacks.emitEvent,
    enqueueLedgerCommand:
      enqueueLedgerCommand ??
      noopTransactionCallbacks.enqueueLedgerCommand,
  }

  const usageMeter = await insertUsageMeter(
    {
      ...usageMeterInput,
      organizationId,
      livemode,
    },
    ctx
  )

  // Invalidate the cached usage meters for this pricing model
  invalidateCache(
    CacheDependency.pricingModelUsageMeters(usageMeter.pricingModelId)
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

  const insertedPrices = await bulkInsertPrices(priceInserts, ctx)

  // Resolve prices by slug instead of relying on array index order
  // This makes the intent explicit and protects against future refactoring mistakes
  const noChargePrice = insertedPrices.find(
    (p) => p.slug === noChargePriceInsert.slug
  )
  if (!noChargePrice) {
    throw new Error('Failed to resolve no-charge usage price')
  }

  const price = hasUserSpecifiedPrice
    ? insertedPrices.find((p) => p.slug === usageMeter.slug)
    : noChargePrice
  if (!price) {
    throw new Error('Failed to resolve inserted usage price')
  }

  return {
    usageMeter,
    price,
    noChargePrice,
  }
}
