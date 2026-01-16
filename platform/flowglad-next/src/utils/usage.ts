import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import type { AuthenticatedTransactionParams } from '@/db/types'
import { IntervalUnit, PriceType } from '@/types'
import { createProductTransaction } from '@/utils/pricingModel'

/** Price fields used in usage meter creation/updates */
type UsageMeterPriceFields = {
  type?: PriceType
  unitPrice?: number
  usageEventsPerUnit?: number
}

/**
 * Creates a usage meter along with a corresponding product and usage price.
 * The product and price will have the same slug as the usage meter.
 * The price defaults to $0.00 per usage event unless custom price values are provided.
 *
 * @throws Error if there's a slug collision with existing products or prices in the pricing model
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
  product: Product.Record
  price: Price.Record
}> => {
  if (!organizationId) {
    throw new Error(
      'organizationId is required to create a usage meter'
    )
  }

  const { usageMeter: usageMeterInput, price: priceInput } = payload

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

  // Create product and price using the same slug as the usage meter
  // This will throw if there's a slug collision, causing the transaction to rollback
  const { product, prices } = await createProductTransaction(
    {
      product: {
        name: usageMeter.name,
        slug: usageMeter.slug,
        pricingModelId: usageMeter.pricingModelId,
        default: false,
        active: true,
        singularQuantityLabel: 'unit',
        pluralQuantityLabel: 'units',
      },
      prices: [
        {
          type: PriceType.Usage,
          slug: usageMeter.slug,
          unitPrice,
          usageMeterId: usageMeter.id,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageEventsPerUnit,
          trialPeriodDays: null,
          isDefault: true,
          active: true,
        },
      ],
    },
    { transaction, livemode, organizationId, userId, invalidateCache }
  )

  return {
    usageMeter,
    product,
    price: prices[0],
  }
}
