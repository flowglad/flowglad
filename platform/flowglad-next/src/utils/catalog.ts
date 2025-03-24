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
  selectPricesAndProductsByProductWhere,
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
import {
  insertCatalog,
  selectCatalogById,
} from '@/db/tableMethods/catalogMethods'

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

export const cloneCatalog = async (
  input: { sourceCatalogId: string; name: string },
  { transaction }: AuthenticatedTransactionParams
) => {
  const catalog = await selectCatalogById(
    input.sourceCatalogId,
    transaction
  )
  if (!catalog) {
    throw new Error('Catalog not found')
  }
  const newCatalog = await insertCatalog(
    {
      name: input.name,
      livemode: catalog.livemode,
      isDefault: false,
      organizationId: catalog.organizationId,
    },
    transaction
  )
  const productsWithPrices =
    await selectPricesAndProductsByProductWhere(
      {
        catalogId: catalog.id,
      },
      transaction
    )
  const products = productsWithPrices.map(({ product }) => product)
}
