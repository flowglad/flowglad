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
import {
  upsertStripePriceFromPrice,
  upsertStripeProductFromProduct,
} from './stripe'
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
  const createdPrice = await insertPrice(payload, transaction)

  // Fetch the associated product to get its Stripe ID
  const product = await selectProductById(
    createdPrice.productId,
    transaction
  )
  if (!product) {
    throw new Error('Associated product not found')
  }
  if (!product.stripeProductId) {
    throw new Error('Associated product is missing Stripe ID')
  }

  // Create or update Stripe price
  const stripePrice = await upsertStripePriceFromPrice({
    price: createdPrice,
    productStripeId: product.stripeProductId!,
    livemode: product.livemode,
  })
  createdPrice.stripePriceId = stripePrice.id

  // Update the price with the Stripe price ID
  const updatedPrice = await updatePrice(
    { ...createdPrice, stripePriceId: stripePrice.id },
    transaction
  )
  return updatedPrice
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
      stripeProductId: null,
    },
    transaction
  )

  // Create or update Stripe product
  const stripeProduct = await upsertStripeProductFromProduct(
    createdProduct,
    createdProduct.livemode
  )
  createdProduct.stripeProductId = stripeProduct.id
  const updatedProduct = await updateProduct(
    {
      id: createdProduct.id,
      stripeProductId: stripeProduct.id,
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
    product: updatedProduct,
    prices: createdPrices,
  }
}

export const editProduct = async (
  payload: { product: Product.Update },
  { transaction }: AuthenticatedTransactionParams
) => {
  const updatedProduct = await updateProduct(
    payload.product,
    transaction
  )
  await upsertStripeProductFromProduct(
    updatedProduct,
    updatedProduct.livemode
  )
  return updatedProduct
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

  let updatedPrice = await updatePrice(
    price as Price.Update,
    transaction
  )

  if (price.stripePriceId && pricingDetailsChanged) {
    const [product] = await selectProducts(
      { id: price.productId },
      transaction
    )
    const newStripePrice = await upsertStripePriceFromPrice({
      price: updatedPrice,
      productStripeId: product.stripeProductId!,
      oldPrice: previousPrice,
      livemode: product.livemode,
    })
    updatedPrice = await updatePrice(
      { ...updatedPrice, stripePriceId: newStripePrice.id },
      transaction
    )
  }

  return updatedPrice
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
