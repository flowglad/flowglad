/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/migrateTestmodeProductsPricesAndCustomersToStripeSandbox.ts
*/
import * as R from 'ramda'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { Product, products } from '@/db/schema/products'
import { Price, prices } from '@/db/schema/prices'
import { eq } from 'drizzle-orm'
import {
  getStripePrice,
  getStripeProduct,
  upsertStripePriceFromPrice,
  upsertStripeProductFromProduct,
} from '@/utils/stripe'
import Stripe from 'stripe'

const migrateProductAndPricesToStripeSandbox = async (
  params: { product: Product.Record; prices: Price.Record[] },
  db: PostgresJsDatabase
) => {
  const product = params.product
  let stripeProduct: Stripe.Product | null = null
  if (product.stripeProductId) {
    try {
      stripeProduct = await getStripeProduct(
        product.stripeProductId,
        false
      )
    } catch (e) {
      console.log('Error getting stripe product', e)
    }
  }
  if (!stripeProduct) {
    stripeProduct = await upsertStripeProductFromProduct(
      {
        ...product,
        stripeProductId: null,
      },
      false
    )
  }
  await db
    .update(products)
    .set({
      stripeProductId: stripeProduct.id,
    })
    .where(eq(products.id, product.id))
  for (const price of params.prices) {
    let stripePrice: Stripe.Price | null = null
    try {
      if (price.stripePriceId) {
        stripePrice = await getStripePrice(price.stripePriceId, false)
      }
    } catch (e) {
      console.log('Error getting stripe price', e)
    }
    if (!stripePrice) {
      stripePrice = await upsertStripePriceFromPrice({
        price: {
          ...price,
          stripePriceId: null,
        },
        productStripeId: stripeProduct.id,
        livemode: false,
      })
    }
    await db.transaction(async (tx) => {
      await tx
        .update(prices)
        .set({
          stripePriceId: stripePrice.id,
        })
        .where(eq(prices.id, price.id))
    })
  }
}

async function migrateTestmodeProductsPricesAndCustomersToStripeSandbox(
  db: PostgresJsDatabase
) {
  const allProducts = await db
    .select({
      product: products,
      prices: prices,
    })
    .from(products)
    .innerJoin(prices, eq(products.id, prices.productId))
    .where(eq(products.livemode, false))
  const productsMap = new Map<
    string,
    (typeof allProducts)[number]['product']
  >()
  const pricesByProductId = new Map<
    string,
    (typeof allProducts)[number]['prices'][]
  >()

  for (const { product, prices: price } of allProducts) {
    if (!productsMap.has(product.id)) {
      productsMap.set(product.id, product)
      pricesByProductId.set(product.id, [])
    }
    pricesByProductId.get(product.id)?.push(price)
  }

  const groupedProducts = Array.from(productsMap.values()).map(
    (product) => ({
      product: product as Product.Record,
      prices: (pricesByProductId.get(product.id) ??
        []) as Price.Record[],
    })
  )

  for (const product of groupedProducts) {
    await migrateProductAndPricesToStripeSandbox(product, db)
  }
}

runScript(migrateTestmodeProductsPricesAndCustomersToStripeSandbox)
