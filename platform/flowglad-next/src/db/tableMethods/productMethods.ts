import * as R from 'ramda'
import { z } from 'zod'
import {
  type Price,
  pricesClientSelectSchema,
  productsTableRowDataSchema,
} from '@/db/schema/prices'
import {
  type PricingModel,
  pricingModelsClientSelectSchema,
} from '@/db/schema/pricingModels'
import {
  type Product,
  products,
  productsClientSelectSchema,
  productsInsertSchema,
  productsSelectSchema,
  productsUpdateSchema,
} from '@/db/schema/products'
import {
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import { groupBy } from '@/utils/core'
import type { ProperNoun } from '../schema/properNouns'
import type { DbTransaction } from '../types'
import { selectMembershipAndOrganizations } from './membershipMethods'
import {
  selectPrices,
  selectPricesAndProductByProductId,
  selectPricesProductsAndPricingModelsForOrganization,
} from './priceMethods'
import { selectPricingModels } from './pricingModelMethods'
import { selectFeaturesByProductFeatureWhere } from './productFeatureMethods'

const config: ORMMethodCreatorConfig<
  typeof products,
  typeof productsSelectSchema,
  typeof productsInsertSchema,
  typeof productsUpdateSchema
> = {
  selectSchema: productsSelectSchema,
  insertSchema: productsInsertSchema,
  updateSchema: productsUpdateSchema,
  tableName: 'products',
}

export const selectProductById = createSelectById(products, config)

export const selectProducts = createSelectFunction(products, config)

export const insertProduct = createInsertFunction(products, config)

export const updateProduct = createUpdateFunction(products, config)

export const productToProperNounUpsert = (
  product: Product.Record
): ProperNoun.Insert => {
  return {
    name: product.name,
    entityId: product.id,
    entityType: 'product',
    organizationId: product.organizationId,
    livemode: product.livemode,
  }
}

export const selectProductsPaginated = createPaginatedSelectFunction(
  products,
  config
)

export const bulkInsertProducts = async (
  productInserts: Product.Insert[],
  transaction: DbTransaction
): Promise<Product.Record[]> => {
  if (productInserts.length === 0) {
    return []
  }
  const results = await transaction
    .insert(products)
    .values(productInserts)
    .returning()
  return results.map((result) => productsSelectSchema.parse(result))
}

export const bulkInsertOrDoNothingProducts =
  createBulkInsertOrDoNothingFunction(products, config)

export const bulkInsertOrDoNothingProductsByExternalId = (
  productInserts: Product.Insert[],
  transaction: DbTransaction
) => {
  return bulkInsertOrDoNothingProducts(
    productInserts,
    [products.externalId],
    transaction
  )
}

export interface ProductRow {
  prices: Price.ClientRecord[]
  product: Product.ClientRecord
  pricingModel?: PricingModel.ClientRecord
}

export const getProductTableRows = async (
  {
    cursor,
    limit = 10,
    filters = {},
  }: {
    cursor: string
    limit?: number
    filters?: {
      active?: boolean
      organizationId?: string
    }
  },
  transaction: DbTransaction,
  userId: string
): Promise<{
  data: ProductRow[]
  total: number
  hasMore: boolean
}> => {
  // Get the user's organization
  const [membership] = await selectMembershipAndOrganizations(
    {
      userId,
      focused: true,
    },
    transaction
  )

  // Get products with prices and pricingModels
  const productsResult =
    await selectPricesProductsAndPricingModelsForOrganization(
      {},
      membership.organization.id,
      transaction
    )

  // Apply filters
  let filteredProducts = productsResult

  if (filters.active !== undefined) {
    filteredProducts = filteredProducts.filter(
      (p) => p.product.active === filters.active
    )
  }

  // Group prices by product ID
  const pricesByProductId = new Map<string, Price.ClientRecord[]>()
  filteredProducts.forEach((p) => {
    pricesByProductId.set(p.product.id, [
      ...(pricesByProductId.get(p.product.id) ?? []),
      p.price,
    ])
  })

  // Get unique products
  const uniqueProducts = R.uniqBy(
    (p) => p.id,
    filteredProducts.map((p) => p.product)
  )

  // Group pricingModels by product ID
  const pricingModelsByProductId = new Map<
    string,
    PricingModel.ClientRecord
  >()
  filteredProducts.forEach((p) => {
    pricingModelsByProductId.set(p.product.id, p.pricingModel)
  })

  // Format products with prices and pricingModels
  const products = uniqueProducts.map((product) => ({
    product,
    prices: pricesByProductId.get(product.id) ?? [],
    pricingModel: pricingModelsByProductId.get(product.id),
  }))

  // Sort products by creation date
  products.sort((a, b) => b.product.createdAt - a.product.createdAt)

  // Apply pagination
  const pageIndex = parseInt(cursor) || 0
  const startIndex = pageIndex * limit
  const endIndex = startIndex + limit
  const paginatedProducts = products.slice(startIndex, endIndex)

  return {
    data: paginatedProducts,
    total: products.length,
    hasMore: endIndex < products.length,
  }
}

export const selectProductsCursorPaginated =
  createCursorPaginatedSelectFunction(
    products,
    config,
    productsTableRowDataSchema,
    async (data, transaction) => {
      const pricesForProducts = await selectPrices(
        {
          productId: data.map((product) => product.id),
        },
        transaction
      )
      const pricingModelsForProducts = await selectPricingModels(
        {
          id: data.map((product) => product.pricingModelId),
        },
        transaction
      )
      const pricesByProductId: Record<string, Price.ClientRecord[]> =
        groupBy((p) => p.productId, pricesForProducts)
      const pricingModelsById: Record<
        string,
        PricingModel.ClientRecord[]
      > = groupBy((c) => c.id, pricingModelsForProducts)

      // Format products with prices and pricingModels
      return data.map((product) => ({
        product,
        prices: pricesByProductId[product.id] ?? [],
        pricingModel: pricingModelsById[product.pricingModelId]?.[0],
      }))
    }
  )

export const selectProductPriceAndFeaturesByProductId = async (
  productId: string,
  transaction: DbTransaction
) => {
  let productWithPrices
  try {
    productWithPrices = await selectPricesAndProductByProductId(
      productId,
      transaction
    )
  } catch (error) {
    // If product lookup fails because it has no prices, try to get the product directly
    const product = await selectProductById(productId, transaction)
    const prices = await selectPrices({ productId }, transaction)
    productWithPrices = {
      ...product,
      prices,
    }
  }

  const { prices, ...product } = productWithPrices
  const features = await selectFeaturesByProductFeatureWhere(
    {
      productId: productId,
    },
    transaction
  )
  return {
    product,
    prices,
    features: features.map((f) => f.feature),
  }
}
