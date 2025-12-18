import { TRPCError } from '@trpc/server'
import omit from 'ramda/src/omit'
import type { Feature } from '@/db/schema/features'
import {
  type CreateProductPriceInput,
  type Price,
  type ProductWithPrices,
  priceImmutableFields,
  pricesInsertSchema,
} from '@/db/schema/prices'
import type { ClonePricingModelInput } from '@/db/schema/pricingModels'
import type { ProductFeature } from '@/db/schema/productFeatures'
import type { Product } from '@/db/schema/products'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  bulkInsertOrDoNothingFeaturesByPricingModelIdAndSlug,
  selectFeatures,
} from '@/db/tableMethods/featureMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  bulkInsertPrices,
  insertPrice,
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPrices,
  selectPricesAndProductsByProductWhere,
} from '@/db/tableMethods/priceMethods'
import {
  insertPricingModel,
  selectPricingModelById,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from '@/db/tableMethods/pricingModelMethods'
import {
  bulkInsertProductFeatures,
  selectProductFeatures,
  syncProductFeatures,
} from '@/db/tableMethods/productFeatureMethods'
import {
  bulkInsertProducts,
  insertProduct,
  selectProductById,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import {
  bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId,
  selectUsageMeters,
} from '@/db/tableMethods/usageMeterMethods'
import type {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import { DestinationEnvironment } from '@/types'
import { validateDefaultProductUpdate } from '@/utils/defaultProductValidation'

export const isPriceChanged = (
  newPrice: Price.ClientInsert,
  currentPrice: Price.ClientRecord | undefined
): boolean => {
  if (!currentPrice) {
    return true
  }
  // Normalize price input for comparison: use current price's values for fields not provided
  // This avoids false positives when checking if price changed (e.g., undefined vs null)
  // Normalize fields that we check: slug, name, isDefault, active, trialPeriodDays
  // Use currentPrice's exact value (including undefined) to ensure strict equality comparison works
  const priceForComparison: Price.ClientInsert = {
    ...newPrice,
    slug:
      newPrice.slug !== undefined ? newPrice.slug : currentPrice.slug,
    name:
      newPrice.name !== undefined ? newPrice.name : currentPrice.name,
    isDefault:
      newPrice.isDefault !== undefined
        ? newPrice.isDefault
        : currentPrice.isDefault,
    active:
      newPrice.active !== undefined
        ? newPrice.active
        : currentPrice.active,
    trialPeriodDays:
      newPrice.trialPeriodDays !== undefined
        ? newPrice.trialPeriodDays
        : currentPrice.trialPeriodDays,
  } as Price.ClientInsert

  // Compare all immutable/create-only fields
  const immutableFieldsChanged = priceImmutableFields.some(
    (field) => {
      const key = field as keyof Price.ClientInsert &
        keyof Price.ClientRecord
      return priceForComparison[key] !== currentPrice[key]
    }
  )
  if (immutableFieldsChanged) {
    return true
  }
  // Also check for changes in other important fields
  const additionalFields: (keyof Price.ClientInsert &
    keyof Price.ClientRecord)[] = [
    'isDefault',
    'name',
    'active',
    'slug',
  ]
  return additionalFields.some((field) => {
    const newValue = priceForComparison[field]
    const currentValue = currentPrice[field]
    // Treat null and undefined as equivalent for comparison
    if (
      (newValue == null && currentValue == null) ||
      newValue === currentValue
    ) {
      return false
    }
    return true
  })
}

export const createPrice = async (
  payload: Price.Insert,
  transaction: DbTransaction
) => {
  return insertPrice(payload, transaction)
}

export const createPriceTransaction = async (
  payload: { price: Price.ClientInsert },
  {
    transaction,
    livemode,
    organizationId,
  }: AuthenticatedTransactionParams
) => {
  const { price } = payload
  if (!organizationId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'organizationId is required to create a price',
    })
  }

  // Get product to check if it's a default product
  const product = await selectProductById(
    price.productId,
    transaction
  )

  // Get all prices for this product to validate constraints
  const existingPrices = await selectPrices(
    { productId: price.productId },
    transaction
  )

  // Forbid creating additional prices for default products
  if (product.default && existingPrices.length > 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cannot create additional prices for the default plan',
    })
  }

  // Validate that default prices on default products must have unitPrice = 0
  if (price.isDefault && product.default && price.unitPrice !== 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Default prices on default products must have unitPrice = 0',
    })
  }

  // Forbid creating price of a different type
  if (
    existingPrices.length > 0 &&
    existingPrices.some(
      (existingPrice) => existingPrice.type !== price.type
    )
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Cannot create price of a different type than the existing prices for the product',
    })
  }

  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )

  // for now, created prices have default = true and active = true
  const newPrice = await safelyInsertPrice(
    {
      ...price,
      livemode: livemode ?? false,
      currency: organization.defaultCurrency,
      externalId: null,
    },
    transaction
  )

  return newPrice
}

export const createProductTransaction = async (
  payload: {
    product: Product.ClientInsert
    prices: CreateProductPriceInput[]
    featureIds?: string[]
  },
  { userId, transaction, livemode }: AuthenticatedTransactionParams
) => {
  // Validate that usage prices are not created with featureIds
  if (payload.featureIds && payload.featureIds.length > 0) {
    const hasUsagePrice = payload.prices.some(
      (price) => price.type === 'usage'
    )
    if (hasUsagePrice) {
      throw new Error(
        'Cannot create usage prices with feature assignments. Usage prices must be associated with usage meters only.'
      )
    }
  }

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

export const editProductTransaction = async (
  payload: {
    product: Product.Update
    featureIds?: string[]
    price?: Price.ClientInsert
  },
  {
    transaction,
    livemode,
    organizationId,
    userId,
  }: AuthenticatedTransactionParams
) => {
  const { product, featureIds, price } = payload

  // Fetch the existing product to check if it's a default product
  const existingProduct = await selectProductById(
    product.id,
    transaction
  )
  if (!existingProduct) {
    throw new Error('Product not found')
  }

  // Check if product slug is being mutated
  // Compare slug values, treating null and undefined as equivalent
  const existingSlug = existingProduct.slug ?? null
  const newSlug = product.slug ?? null
  const isSlugMutating =
    product.slug !== undefined && newSlug !== existingSlug

  // If default product, always force active=true on edit to auto-correct bad states
  const isDefaultProduct = existingProduct.default
  const enforcedProduct = isDefaultProduct
    ? { ...product, active: true }
    : product

  // Validate that default products can only have certain fields updated
  validateDefaultProductUpdate(enforcedProduct, existingProduct)

  const updatedProduct = await updateProduct(
    enforcedProduct,
    transaction
  )

  if (!updatedProduct) {
    throw new Error('Product not found or update failed')
  }

  if (featureIds !== undefined) {
    await syncProductFeatures(
      {
        product: updatedProduct,
        desiredFeatureIds: featureIds,
      },
      transaction
    )
  }
  /**
   * Don't attempt to update prices for default products,
   * quietly skip over it if it's a default product
   */
  if (!isDefaultProduct) {
    const existingPrices = await selectPrices(
      { productId: product.id },
      transaction
    )
    const currentPrice = existingPrices.find(
      (p) => p.active && p.isDefault
    )

    if (price) {
      // Check if price changed (normalization is handled inside isPriceChanged)
      const priceChanged = isPriceChanged(price, currentPrice)

      if (priceChanged) {
        // New price will be inserted - sync slug if product slug changed
        const organization = await selectOrganizationById(
          organizationId,
          transaction
        )
        await safelyInsertPrice(
          {
            ...price,
            slug: isSlugMutating
              ? updatedProduct.slug
              : (price.slug ?? currentPrice?.slug ?? null),
            livemode,
            currency: organization.defaultCurrency,
            externalId: null,
          },
          transaction
        )
      } else if (isSlugMutating && currentPrice) {
        // No new price inserted (immutable fields unchanged), but product slug changed - update existing price slug
        await safelyUpdatePrice(
          {
            id: currentPrice.id,
            type: currentPrice.type,
            slug: updatedProduct.slug,
          },
          transaction
        )
      }
    } else if (isSlugMutating && currentPrice) {
      // No price input provided, but product slug changed - update existing price slug
      await safelyUpdatePrice(
        {
          id: currentPrice.id,
          type: currentPrice.type,
          slug: updatedProduct.slug,
        },
        transaction
      )
    }
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
  const livemode = input.destinationEnvironment
    ? input.destinationEnvironment === DestinationEnvironment.Livemode
    : pricingModel.livemode
  const newPricingModel = await insertPricingModel(
    {
      name: input.name,
      livemode,
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

  // Create a mapping from old usage meter ID to slug for later remapping
  const oldUsageMeterIdToSlug = new Map(
    sourceUsageMeters.map((meter) => [meter.id, meter.slug])
  )

  if (sourceUsageMeters.length > 0) {
    const usageMeterInserts: UsageMeter.Insert[] =
      sourceUsageMeters.map((meter) =>
        omit(['id'], {
          ...meter,
          pricingModelId: newPricingModel.id,
          livemode,
        })
      )
    await bulkInsertOrDoNothingUsageMetersBySlugAndPricingModelId(
      usageMeterInserts,
      transaction
    )
  }

  // Get newly created usage meters to build slug to new ID mapping
  const newUsageMeters = await selectUsageMeters(
    { pricingModelId: newPricingModel.id },
    transaction
  )

  // Create mapping from slug to new usage meter ID
  const slugToNewUsageMeterId = new Map(
    newUsageMeters.map((meter) => [meter.slug, meter.id])
  )

  // Clone features from source pricing model
  const sourceFeatures = await selectFeatures(
    { pricingModelId: pricingModel.id },
    transaction
  )

  if (sourceFeatures.length > 0) {
    const featureInserts = sourceFeatures.map((feature) => {
      // Remap usageMeterId if present
      let remappedUsageMeterId = feature.usageMeterId
      if (feature.usageMeterId) {
        const oldSlug = oldUsageMeterIdToSlug.get(
          feature.usageMeterId
        )
        if (oldSlug) {
          remappedUsageMeterId =
            slugToNewUsageMeterId.get(oldSlug) || null
        }
      }

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
          livemode,
          pricingModelId: newPricingModel.id,
          usageMeterId: remappedUsageMeterId,
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
        livemode,
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
          livemode,
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
            livemode,
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
          livemode,
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
