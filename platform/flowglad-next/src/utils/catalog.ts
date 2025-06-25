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
  CreateProductSchema,
  Price,
  pricesInsertSchema,
  ProductWithPrices,
} from '@/db/schema/prices'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { productsInsertSchema, Product } from '@/db/schema/products'
import {
  insertCatalog,
  safelyInsertCatalog,
  selectCatalogById,
  selectCatalogsWithProductsAndUsageMetersByCatalogWhere,
} from '@/db/tableMethods/catalogMethods'
import { Catalog, CloneCatalogInput } from '@/db/schema/catalogs'
import {
  syncProductFeatures,
  bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId,
} from '@/db/tableMethods/productFeatureMethods'
import {
  SetupCatalogInput,
  SetupCatalogProductInput,
  SetupCatalogProductPriceInput,
  validateSetupCatalogInput,
} from './catalogs/setupSchemas'
import { Feature } from '@/db/schema/features'
import { bulkInsertOrDoNothingUsageMetersBySlugAndCatalogId } from '@/db/tableMethods/usageMeterMethods'
import { FeatureType, PriceType } from '@/types'
import { bulkInsertOrDoNothingFeaturesByCatalogIdAndSlug } from '@/db/tableMethods/featureMethods'
import { hashData } from './backendCore'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
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
  const createdPrices = await Promise.all(
    pricesWithSafelyDefaultPrice.map(async (price) => {
      return createPrice(
        {
          ...price,
          productId: createdProduct.id,
          livemode,
          currency: defaultCurrency,
          externalId: null,
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
  const products = productsWithPrices as ProductWithPrices[]
  // Create a map of existing product id => new product insert
  const productInsertMap = new Map<string, Product.Insert>(
    products.map((product) => [
      product.id,
      omit(['id'], {
        ...product,
        catalogId: newCatalog.id,
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

  // Return the newly created catalog with products and prices
  const [newCatalogWithProducts] =
    await selectCatalogsWithProductsAndUsageMetersByCatalogWhere(
      { id: newCatalog.id },
      transaction
    )

  return newCatalogWithProducts
}

const externalIdFromProductData = (
  product: SetupCatalogProductInput
) => {
  return hashData(JSON.stringify(product))
}

export const setupCatalogTransaction = async (
  {
    input: rawInput,
    organizationId,
    livemode,
  }: {
    input: SetupCatalogInput
    organizationId: string
    livemode: boolean
  },
  transaction: DbTransaction
) => {
  const input = validateSetupCatalogInput(rawInput)
  const catalogInsert: Catalog.Insert = {
    name: input.name,
    livemode,
    organizationId,
    isDefault: input.isDefault,
  }
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )
  const catalog = await safelyInsertCatalog(
    catalogInsert,
    transaction
  )
  const usageMeterInserts: UsageMeter.Insert[] =
    input.usageMeters.map((usageMeter) => ({
      slug: usageMeter.slug,
      name: usageMeter.name,
      livemode,
      organizationId,
      catalogId: catalog.id,
    }))
  const usageMeters =
    await bulkInsertOrDoNothingUsageMetersBySlugAndCatalogId(
      usageMeterInserts,
      transaction
    )
  const usageMetersBySlug = new Map(
    usageMeters.map((usageMeter) => [usageMeter.slug, usageMeter])
  )
  const featureInserts: Feature.Insert[] = input.features.map(
    (feature) => {
      const coreParams: Pick<
        Feature.Insert,
        | 'slug'
        | 'catalogId'
        | 'livemode'
        | 'organizationId'
        | 'name'
        | 'description'
      > = {
        slug: feature.slug,
        name: feature.name,
        description: feature.description,
        catalogId: catalog.id,
        livemode,
        organizationId,
      }
      if (feature.type === FeatureType.UsageCreditGrant) {
        const usageMeter = usageMetersBySlug.get(
          feature.usageMeterSlug
        )
        if (!usageMeter) {
          throw new Error(
            `Usage meter ${feature.usageMeterSlug} not found`
          )
        }
        return {
          ...coreParams,
          type: FeatureType.UsageCreditGrant,
          usageMeterId: usageMeter.id,
          amount: feature.amount,
          renewalFrequency: feature.renewalFrequency,
        }
      }
      return {
        ...coreParams,
        type: FeatureType.Toggle,
        usageMeterId: null,
        amount: null,
        renewalFrequency: null,
      }
    }
  )
  const features =
    await bulkInsertOrDoNothingFeaturesByCatalogIdAndSlug(
      featureInserts,
      transaction
    )
  const productInserts: Product.Insert[] = input.products.map(
    (product) => {
      return {
        ...product.product,
        catalogId: catalog.id,
        livemode,
        organizationId,
        externalId: externalIdFromProductData(product),
      }
    }
  )
  const products = await bulkInsertProducts(
    productInserts,
    transaction
  )
  const productsByExternalId = new Map(
    products.map((product) => [product.externalId, product])
  )

  const priceInserts: Price.Insert[] = input.products.flatMap(
    (product) => {
      const productId = productsByExternalId.get(
        externalIdFromProductData(product)
      )?.id
      if (!productId) {
        throw new Error(`Product ${product.product.name} not found`)
      }
      return product.prices.map((price) => {
        if (price.type === PriceType.Usage) {
          const usageMeterId = features.find(
            (feature) => feature.slug === price.usageMeterSlug
          )?.usageMeterId
          if (!usageMeterId) {
            throw new Error(
              `Usage meter ${price.usageMeterSlug} not found`
            )
          }
          return {
            ...price,
            currency: organization.defaultCurrency,
            productId,
            livemode,
            externalId: null,
            usageMeterId,
          }
        }
        return {
          ...price,
          currency: organization.defaultCurrency,
          productId,
          livemode,
          externalId: null,
        }
      })
    }
  )
  const prices = await bulkInsertPrices(priceInserts, transaction)
  const featuresBySlug = new Map(
    features.map((feature) => [feature.slug, feature])
  )

  const productFeatureInserts: ProductFeature.Insert[] =
    input.products.flatMap((product) => {
      return product.features.map((featureSlug) => {
        const feature = featuresBySlug.get(featureSlug)
        if (!feature) {
          throw new Error(`Feature ${featureSlug} not found`)
        }
        const productId = productsByExternalId.get(
          externalIdFromProductData(product)
        )?.id
        if (!productId) {
          throw new Error(`Product ${product.product.name} not found`)
        }
        return {
          organizationId,
          productId,
          featureId: feature.id,
          livemode,
          externalId: null,
        }
      })
    })
  const productFeatures =
    await bulkInsertOrDoNothingProductFeaturesByProductIdAndFeatureId(
      productFeatureInserts,
      transaction
    )

  return {
    catalog,
    products,
    prices,
    features,
    productFeatures,
  }
}
