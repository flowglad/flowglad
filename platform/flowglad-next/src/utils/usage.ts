import { AuthenticatedTransactionParams } from '@/db/types'
import { UsageMeter } from '@/db/schema/usageMeters'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import {
  insertUsageMeter,
  updateUsageMeter as updateUsageMeterDB,
} from '@/db/tableMethods/usageMeterMethods'
import {
  createProductTransaction,
  createPriceTransaction,
} from '@/utils/pricingModel'
import { selectProducts } from '@/db/tableMethods/productMethods'
import { IntervalUnit, PriceType } from '@/types'

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
    { transaction, livemode, organizationId, userId }
  )

  return {
    usageMeter,
    product,
    price: prices[0],
  }
}

/**
 * Updates a usage meter and optionally creates a new price for it.
 * If price fields are provided, a new price will be created and marked as active/default,
 * while old prices are marked as inactive/non-default.
 *
 * @throws Error if usage meter or product not found
 */
export const updateUsageMeterTransaction = async (
  payload: {
    id: string
    usageMeter: UsageMeter.ClientUpdate
    price?: UsageMeterPriceFields
  },
  {
    transaction,
    livemode,
    organizationId,
    userId,
  }: AuthenticatedTransactionParams
): Promise<{
  usageMeter: UsageMeter.Record
  price?: Price.Record
}> => {
  const {
    id,
    usageMeter: usageMeterInput,
    price: priceInput,
  } = payload

  const usageMeter = await updateUsageMeterDB(
    {
      ...usageMeterInput,
      id,
    },
    transaction
  )

  // If price fields are provided, create a new price
  let price: Price.Record | undefined
  if (priceInput && priceInput.unitPrice !== undefined) {
    // Find the product associated with this usage meter
    const products = await selectProducts(
      {
        slug: usageMeter.slug,
        pricingModelId: usageMeter.pricingModelId,
      },
      transaction
    )

    if (products.length === 0) {
      throw new Error(
        `No product found for usage meter with slug ${usageMeter.slug}`
      )
    }

    const product = products[0]

    // Create new price using createPriceTransaction
    // This will automatically mark it as active/default and old prices as inactive/non-default
    price = await createPriceTransaction(
      {
        price: {
          type: PriceType.Usage,
          slug: usageMeter.slug,
          unitPrice: priceInput.unitPrice,
          usageMeterId: usageMeter.id,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          usageEventsPerUnit: priceInput.usageEventsPerUnit ?? 1,
          trialPeriodDays: null,
          isDefault: true,
          active: true,
          productId: product.id,
        },
      },
      { transaction, livemode, organizationId, userId }
    )
  }

  return {
    usageMeter,
    price,
  }
}
