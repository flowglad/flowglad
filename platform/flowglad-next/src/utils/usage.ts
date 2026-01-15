import type { Price } from '@/db/schema/prices'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { safelyInsertPrice } from '@/db/tableMethods/priceMethods'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import type {
  AuthenticatedTransactionParams,
  TransactionEffectsContext,
} from '@/db/types'
import { IntervalUnit, PriceType } from '@/types'

/** Price fields used in usage meter creation/updates */
type UsageMeterPriceFields = {
  type?: PriceType
  unitPrice?: number
  usageEventsPerUnit?: number
}

/**
 * Creates a usage meter along with a corresponding usage price.
 * The price will have the same slug as the usage meter and have productId: null.
 * The price defaults to $0.00 per usage event unless custom price values are provided.
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
  }: Omit<AuthenticatedTransactionParams, 'invalidateCache'>
): Promise<{
  usageMeter: UsageMeter.Record
  price: Price.Record
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

  // Use provided price values or defaults
  const unitPrice = priceInput?.unitPrice ?? 0
  const usageEventsPerUnit = priceInput?.usageEventsPerUnit ?? 1

  // Create usage price directly with productId: null
  // Usage prices belong to usage meters, not products
  const price = await safelyInsertPrice(
    {
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
    },
    transaction
  )

  return {
    usageMeter,
    price,
  }
}
