import {
  insertProduct,
  selectProductById,
  selectProducts,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import {
  insertPrice,
  makePriceDefault,
  selectPrices,
  selectPricesAndProductsForOrganization,
  updatePrice,
} from '@/db/tableMethods/priceMethods'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import { Price } from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { Product } from '@/db/schema/products'

export const createPrice = async (
  payload: Price.Insert,
  transaction: DbTransaction
) => {
  return insertPrice(payload, transaction)
}

export const createProductTransaction = async (
  payload: {
    product: Product.ClientInsert
    prices: Price.ClientInsert[]
  },
  { userId, transaction, livemode }: AuthenticatedTransactionParams
) => {
  const [
    {
      organization: { id: organizationId, defaultCurrency },
    },
  ] = await selectMembershipAndOrganizations(
    {
      userId,
      focused: true,
    },
    transaction
  )
  const createdProduct = await insertProduct(
    {
      ...payload.product,
      active: true,
      organizationId,
      livemode,
    },
    transaction
  )

  const createdPrices = await Promise.all(
    payload.prices.map(async (price) => {
      return createPrice(
        {
          ...price,
          productId: createdProduct.id,
          livemode,
          currency: defaultCurrency,
        },
        transaction
      )
    })
  )
  return {
    product: createdProduct,
    prices: createdPrices,
  }
}

export const editProduct = async (
  payload: { product: Product.Update },
  { transaction }: AuthenticatedTransactionParams
) => {
  return updateProduct(payload.product, transaction)
}

export const editPriceTransaction = async (
  params: { price: Price.Update },
  transaction: DbTransaction
) => {
  const { price } = params
  // Get all prices for this product to validate default price constraint
  const existingPrices = await selectPrices(
    { productId: price.productId },
    transaction
  )
  const previousPrice = existingPrices.find((v) => v.id === price.id)
  const pricingDetailsChanged =
    previousPrice?.unitPrice !== price.unitPrice ||
    previousPrice?.intervalUnit !== price.intervalUnit ||
    previousPrice?.intervalCount !== price.intervalCount

  // If we're setting this price as default, update the previous default price
  if (price.isDefault) {
    await makePriceDefault(price.id, transaction)
  }

  return updatePrice(price, transaction)
}

export const selectCatalog = async (
  { organizationId }: { organizationId: string },
  transaction: DbTransaction
) => {
  const result = await selectPricesAndProductsForOrganization(
    { active: true },
    organizationId,
    transaction
  )
  // Group prices by product
  const productMap = new Map<
    string,
    { product: Product.Record; prices: Price.Record[] }
  >()

  for (const { product, price } of result) {
    if (!productMap.has(product.id)) {
      productMap.set(product.id, {
        product,
        prices: [],
      })
    }
    productMap.get(product.id)!.prices.push(price)
  }

  return Array.from(productMap.values())
}
