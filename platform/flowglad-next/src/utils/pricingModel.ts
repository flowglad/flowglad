import omit from 'ramda/src/omit'
import {
  bulkInsertProducts,
  insertProduct,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import {
  bulkInsertPrices,
  insertPrice,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  CreateProductPriceInput,
  Price,
  pricesInsertSchema,
  ProductWithPrices,
} from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { Product } from '@/db/schema/products'
import {
  insertPricingModel,
  selectPricingModelById,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from '@/db/tableMethods/pricingModelMethods'
import { ClonePricingModelInput } from '@/db/schema/pricingModels'
import {
  syncProductFeatures,
  selectProductFeatures,
  bulkInsertProductFeatures,
} from '@/db/tableMethods/productFeatureMethods'
import {
  selectUsageMeters,
  bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId,
} from '@/db/tableMethods/usageMeterMethods'
import {
  selectFeatures,
  bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug,
} from '@/db/tableMethods/featureMethods'
import { UsageMeter } from '@/db/schema/usageMeters'
import { Feature } from '@/db/schema/features'
import { ProductFeature } from '@/db/schema/productFeatures'

export const createPrice = async (
  payload: Price.Insert,
  transaction: DbTransaction
) => {
  return insertPrice(payload, transaction)
}

export const createProductTransaction = async (
  payload: {
    product: Product.ClientInsert
    prices: CreateProductPriceInput[]
    featureIds?: string[]
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
      externalId: null,
    },
    transaction
  )
  if (payload.featureIds) {
    await syncProductFeatures(
      {
        product: createdProduct,
        desiredFeatureIds: payload.featureIds,
      },
      transaction
    )
  }
  const pricesWithSafelyDefaultPrice = payload.prices.some(
    (price) => price.isDefault
  )
    ? payload.prices
    : [
        {
          ...payload.prices[0],
          isDefault: true,
        },
        ...payload.prices.slice(1),
      ]
  // Use bulk insert instead of multiple individual inserts
  const priceInserts = pricesWithSafelyDefaultPrice.map((price) => ({
    ...price,
    productId: createdProduct.id,
    livemode,
    currency: defaultCurrency,
    externalId: null,
  }))
  const createdPrices = await bulkInsertPrices(
    priceInserts,
    transaction
  )
  return {
    product: createdProduct,
    prices: createdPrices,
  }
}

export const editProduct = async (
  payload: { product: Product.Update; featureIds?: string[] },
  transaction: DbTransaction
) => {
  const updatedProduct = await updateProduct(
    payload.product,
    transaction
  )
  if (updatedProduct && payload.featureIds !== undefined) {
    await syncProductFeatures(
      {
        product: updatedProduct,
        desiredFeatureIds: payload.featureIds,
      },
      transaction
    )
  }
  return updatedProduct
}

export const clonePricingModelTransaction = async (
  input: ClonePricingModelInput,
  transaction: DbTransaction
) => {
  const pricingModel = await selectPricingModelById(
    input.id,
    transaction
  )
  const newPricingModel = await insertPricingModel(
    {
      name: input.name,
      livemode: pricingModel.livemode,
      isDefault: false,
      organizationId: pricingModel.organizationId,
    },
    transaction
  )

  // Clone usage meters from source pricing model
  const sourceUsageMeters = await selectUsageMeters(
    { pricingModelId: pricingModel.id },
    transaction
  )

  if (sourceUsageMeters.length > 0) {
    const usageMeterInserts: UsageMeter.Insert[] =
      sourceUsageMeters.map((meter) =>
        omit(['id'], {
          ...meter,
          pricingModelId: newPricingModel.id,
        })
      )
    await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
      usageMeterInserts,
      transaction
    )
  }

  // Clone features from source pricing model
  const sourceFeatures = await selectFeatures(
    { pricingModelId: pricingModel.id },
    transaction
  )

  if (sourceFeatures.length > 0) {
    const featureInserts = sourceFeatures.map((feature) => {
      const baseFeature = omit(
        [
          'id',
          'createdAt',
          'updatedAt',
          'createdByCommit',
          'updatedByCommit',
          'position',
        ],
        {
          ...feature,
          pricingModelId: newPricingModel.id,
        }
      )
      return baseFeature as Feature.Insert
    })
    await bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug(
      featureInserts,
      transaction
    )
  }
  const productsWithPrices =
    await selectPricesAndProductsByProductWhere(
      {
        pricingModelId: pricingModel.id,
      },
      transaction
    )
  const products = productsWithPrices as ProductWithPrices[]

  // Get all product features for the source products
  const sourceProductIds = products.map((p) => p.id)
  const sourceProductFeatures =
    sourceProductIds.length > 0
      ? await selectProductFeatures(
          { productId: sourceProductIds },
          transaction
        )
      : []
  // Create a map of existing product id => new product insert
  const productInsertMap = new Map<string, Product.Insert>(
    products.map((product) => [
      product.id,
      omit(['id'], {
        ...product,
        pricingModelId: newPricingModel.id,
        externalId: null,
      }),
    ])
  )

  // Create a map of existing product id => price inserts
  const priceInsertsMap = new Map<
    string,
    Omit<Price.Insert, 'productId'>[]
  >(
    productsWithPrices.map(({ prices, ...product }) => [
      product.id,
      prices.map((price) => {
        return omit(['id'], {
          ...price,
          externalId: null,
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

  // Clone product features if any exist
  if (sourceProductFeatures.length > 0) {
    // Get newly created features for mapping
    const newFeatures = await selectFeatures(
      { pricingModelId: newPricingModel.id },
      transaction
    )

    // Create a map from source feature slug to new feature id
    const sourceFeatureSlugs = sourceFeatures.reduce(
      (acc, f) => ({ ...acc, [f.id]: f.slug }),
      {} as Record<string, string>
    )
    const newFeatureIdBySlug = newFeatures.reduce(
      (acc, f) => ({ ...acc, [f.slug]: f.id }),
      {} as Record<string, string>
    )

    // Create product feature inserts with new product and feature ids
    const productFeatureInserts: ProductFeature.Insert[] = []
    for (const sourcePf of sourceProductFeatures) {
      if (sourcePf.expiredAt) {
        // Skip expired product features
        continue
      }
      const newProductId = oldProductIdToNewProductIdMap.get(
        sourcePf.productId
      )
      const sourceFeatureSlug = sourceFeatureSlugs[sourcePf.featureId]
      const newFeatureId = sourceFeatureSlug
        ? newFeatureIdBySlug[sourceFeatureSlug]
        : undefined

      if (newProductId && newFeatureId) {
        productFeatureInserts.push({
          productId: newProductId,
          featureId: newFeatureId,
          organizationId: pricingModel.organizationId,
          livemode: pricingModel.livemode,
        })
      }
    }

    if (productFeatureInserts.length > 0) {
      await bulkInsertProductFeatures(
        productFeatureInserts,
        transaction
      )
    }
  }

  // Return the newly created pricing model with products and prices
  const [newPricingModelWithProducts] =
    await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
      { id: newPricingModel.id },
      transaction
    )

  return newPricingModelWithProducts
}
