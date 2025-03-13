/* Example script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/migrateTestmodeProductsVariantsAndCustomersToStripeSandbox.ts
*/
import * as R from 'ramda'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { Product, products } from '@/db/schema/products'
import { Variant, variants } from '@/db/schema/variants'
import { eq } from 'drizzle-orm'
import {
  getStripePrice,
  getStripeProduct,
  upsertStripePriceFromVariant,
  upsertStripeProductFromProduct,
} from '@/utils/stripe'
import Stripe from 'stripe'

const migrateProductAndVariantsToStripeSandbox = async (
  params: { product: Product.Record; variants: Variant.Record[] },
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
  for (const variant of params.variants) {
    let stripePrice: Stripe.Price | null = null
    try {
      if (variant.stripePriceId) {
        stripePrice = await getStripePrice(
          variant.stripePriceId,
          false
        )
      }
    } catch (e) {
      console.log('Error getting stripe price', e)
    }
    if (!stripePrice) {
      stripePrice = await upsertStripePriceFromVariant({
        variant: {
          ...variant,
          stripePriceId: null,
        },
        productStripeId: stripeProduct.id,
        livemode: false,
      })
    }
    await db.transaction(async (tx) => {
      await tx
        .update(variants)
        .set({
          stripePriceId: stripePrice.id,
        })
        .where(eq(variants.id, variant.id))
    })
  }
}

async function migrateTestmodeProductsVariantsAndCustomersToStripeSandbox(
  db: PostgresJsDatabase
) {
  const allProducts = await db
    .select({
      product: products,
      variants: variants,
    })
    .from(products)
    .innerJoin(variants, eq(products.id, variants.productId))
    .where(eq(products.livemode, false))
  const productsMap = new Map<
    string,
    (typeof allProducts)[number]['product']
  >()
  const variantsByProductId = new Map<
    string,
    (typeof allProducts)[number]['variants'][]
  >()

  for (const { product, variants: variant } of allProducts) {
    if (!productsMap.has(product.id)) {
      productsMap.set(product.id, product)
      variantsByProductId.set(product.id, [])
    }
    variantsByProductId.get(product.id)?.push(variant)
  }

  const groupedProducts = Array.from(productsMap.values()).map(
    (product) => ({
      product: product as Product.Record,
      variants: (variantsByProductId.get(product.id) ??
        []) as Variant.Record[],
    })
  )

  for (const product of groupedProducts) {
    await migrateProductAndVariantsToStripeSandbox(product, db)
  }
}

runScript(migrateTestmodeProductsVariantsAndCustomersToStripeSandbox)
