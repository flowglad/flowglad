import { AuthenticatedTransactionParams } from '@/db/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { insertUsageMeter } from '@/db/tableMethods/usageMeterMethods'
import { createProductTransaction } from '@/utils/pricingModel'
import { IntervalUnit, PriceType } from '@/types'

/**
 * Creates a usage meter along with a corresponding product and usage price.
 * The product and price will have the same slug as the usage meter.
 * The price will be set to $0.00 per usage event.
 *
 * @throws Error if there's a slug collision with existing products or prices in the pricing model
 */
export const createUsageMeterTransaction = async (
  payload: { usageMeter: UsageMeter.ClientInsert },
  {
    transaction,
    livemode,
    organizationId,
    userId,
  }: AuthenticatedTransactionParams
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

  const { usageMeter: usageMeterInput } = payload

  const usageMeter = await insertUsageMeter(
    {
      ...usageMeterInput,
      organizationId,
      livemode,
    },
    transaction
  )

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
          unitPrice: 0, // $0.00 per usage event as specified
          usageMeterId: usageMeter.id,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageEventsPerUnit: 1,
          trialPeriodDays: null,
          isDefault: true,
          active: true,
        },
      ],
    },
    { transaction, livemode, organizationId, userId }
  )

  return {
    usageMeter,
    product,
    price: prices[0],
  }
}
