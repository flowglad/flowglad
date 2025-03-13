import {
  insertProduct,
  selectProductById,
  selectProducts,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import {
  insertVariant,
  selectVariants,
  selectVariantsAndProductsForOrganization,
  updateVariant,
} from '@/db/tableMethods/variantMethods'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  upsertStripePriceFromVariant,
  upsertStripeProductFromProduct,
} from './stripe'
import { Variant } from '@/db/schema/variants'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { Product } from '@/db/schema/products'

export const createVariant = async (
  payload: Variant.Insert,
  transaction: DbTransaction
) => {
  const createdVariant = await insertVariant(payload, transaction)

  // Fetch the associated product to get its Stripe ID
  const product = await selectProductById(
    createdVariant.productId,
    transaction
  )
  if (!product) {
    throw new Error('Associated product not found')
  }
  if (!product.stripeProductId) {
    throw new Error('Associated product is missing Stripe ID')
  }

  // Create or update Stripe price
  const stripePrice = await upsertStripePriceFromVariant({
    variant: createdVariant,
    productStripeId: product.stripeProductId!,
    livemode: product.livemode,
  })
  createdVariant.stripePriceId = stripePrice.id

  // Update the variant with the Stripe price ID
  const updatedVariant = await updateVariant(
    { ...createdVariant, stripePriceId: stripePrice.id },
    transaction
  )
  return updatedVariant
}

export const createProductTransaction = async (
  payload: {
    product: Product.ClientInsert
    variants: Variant.ClientInsert[]
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

  const createdVariants = await Promise.all(
    payload.variants.map(async (variant) => {
      return createVariant(
        {
          ...variant,
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
    variants: createdVariants,
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

export const editVariantTransaction = async (
  params: { variant: Variant.Update },
  transaction: DbTransaction
) => {
  const { variant } = params
  // Get all variants for this product to validate default price constraint
  const existingVariants = await selectVariants(
    { productId: variant.productId },
    transaction
  )
  const previousVariant = existingVariants.find(
    (v) => v.id === variant.id
  )
  const pricingDetailsChanged =
    previousVariant?.unitPrice !== variant.unitPrice ||
    previousVariant?.intervalUnit !== variant.intervalUnit ||
    previousVariant?.intervalCount !== variant.intervalCount

  // If we're setting this variant as default, update the previous default variant
  if (variant.isDefault) {
    const previousDefault = existingVariants.find((v) => v.isDefault)
    if (previousDefault && previousDefault.id !== variant.id) {
      await updateVariant(
        {
          ...previousDefault,
          isDefault: false,
        },
        transaction
      )
    }
  } else {
    // If we're unsetting default, ensure there will still be a default variant
    const updatedVariants = existingVariants.map((v) =>
      v.id === variant.id ? { ...v, ...variant } : v
    )

    const defaultVariants = updatedVariants.filter((v) => v.isDefault)

    if (defaultVariants.length === 0) {
      throw new Error(
        'There must be at least one default variant per product'
      )
    }
  }

  let updatedVariant = await updateVariant(
    variant as Variant.Update,
    transaction
  )

  if (variant.stripePriceId && pricingDetailsChanged) {
    const [product] = await selectProducts(
      { id: variant.productId },
      transaction
    )
    const newStripePrice = await upsertStripePriceFromVariant({
      variant: updatedVariant,
      productStripeId: product.stripeProductId!,
      oldVariant: previousVariant,
      livemode: product.livemode,
    })
    updatedVariant = await updateVariant(
      { ...updatedVariant, stripePriceId: newStripePrice.id },
      transaction
    )
  }

  return updatedVariant
}

export const selectCatalog = async (
  { organizationId }: { organizationId: string },
  transaction: DbTransaction
) => {
  const result = await selectVariantsAndProductsForOrganization(
    { active: true },
    organizationId,
    transaction
  )
  // Group variants by product
  const productMap = new Map<
    string,
    { product: Product.Record; variants: Variant.Record[] }
  >()

  for (const { product, variant } of result) {
    if (!productMap.has(product.id)) {
      productMap.set(product.id, {
        product,
        variants: [],
      })
    }
    productMap.get(product.id)!.variants.push(variant)
  }

  return Array.from(productMap.values())
}
