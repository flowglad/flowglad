import omit from 'ramda/src/omit'
import {
  bulkInsertProducts,
  insertProduct,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import {
  bulkInsertPrices,
  insertPrice,
  makePriceDefault,
  selectPrices,
  selectPricesAndProductsByProductWhere,
  updatePrice,
} from '@/db/tableMethods/priceMethods'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import { Price, pricesInsertSchema } from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { Product } from '@/db/schema/products'
import {
  insertCatalog,
  selectCatalogById,
  selectCatalogsWithProductsByCatalogWhere,
} from '@/db/tableMethods/catalogMethods'
import { CloneCatalogInput } from '@/db/schema/catalogs'

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

export const cloneCatalogTransaction = async (
  input: CloneCatalogInput,
  transaction: DbTransaction
) => {
  const catalog = await selectCatalogById(input.id, transaction)
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
  const products: Product.Record[] = productsWithPrices.map(
    ({ product }) => product
  )
  // Create a map of existing product id => new product insert
  const productInsertMap = new Map<string, Product.Insert>(
    products.map((product) => [
      product.id,
      omit(['id'], {
        ...product,
        catalogId: newCatalog.id,
      }),
    ])
  )

  // Create a map of existing product id => price inserts
  const priceInsertsMap = new Map<
    string,
    Omit<Price.Insert, 'productId'>[]
  >(
    productsWithPrices.map(({ product, prices }) => [
      product.id,
      prices.map((price) => {
        return omit(['id'], {
          ...price,
        })
      }),
    ])
  )

  // Bulk insert all new products
  const newProducts = await bulkInsertProducts(
    Array.from(productInsertMap.values()),
    transaction
  )

  // Create a map of existing product id => new product id
  const oldProductIdToNewProductIdMap = new Map(
    products.map((oldProduct, index) => [
      oldProduct.id,
      newProducts[index].id,
    ])
  )

  // Create array of price inserts with updated product ids
  const allPriceInserts: Price.Insert[] = []
  for (const [
    oldProductId,
    priceInserts,
  ] of priceInsertsMap.entries()) {
    const newProductId =
      oldProductIdToNewProductIdMap.get(oldProductId)
    if (newProductId) {
      const updatedPriceInserts: Price.Insert[] = priceInserts.map(
        (priceInsert) =>
          pricesInsertSchema.parse({
            ...priceInsert,
            productId: newProductId,
          })
      )
      allPriceInserts.push(...updatedPriceInserts)
    }
  }

  // Bulk insert all new prices
  await bulkInsertPrices(allPriceInserts, transaction)

  // Return the newly created catalog with products and prices
  const [newCatalogWithProducts] =
    await selectCatalogsWithProductsByCatalogWhere(
      { id: newCatalog.id },
      transaction
    )

  return newCatalogWithProducts
}
