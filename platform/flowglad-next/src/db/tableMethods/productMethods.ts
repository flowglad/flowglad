import * as R from 'ramda'
import { z } from 'zod'

import {
  createUpsertFunction,
  createSelectById,
  createSelectFunction,
  createInsertFunction,
  ORMMethodCreatorConfig,
  createUpdateFunction,
  createPaginatedSelectFunction,
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
} from '@/db/tableUtils'
import {
  Product,
  products,
  productsInsertSchema,
  productsSelectSchema,
  productsUpdateSchema,
  productsClientSelectSchema,
} from '@/db/schema/products'
import { ProperNoun } from '../schema/properNouns'
import { DbTransaction } from '../types'
import {
  Price,
  pricesClientSelectSchema,
  productsTableRowDataSchema,
} from '@/db/schema/prices'
import {
  Catalog,
  catalogsClientSelectSchema,
} from '@/db/schema/catalogs'
import {
  selectPrices,
  selectPricesProductsAndCatalogsForOrganization,
} from './priceMethods'
import { selectMembershipAndOrganizations } from './membershipMethods'
import { selectCatalogs } from './catalogMethods'
import { groupBy } from '@/utils/core'

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
  catalog?: Catalog.ClientRecord
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

  // Get products with prices and catalogs
  const productsResult =
    await selectPricesProductsAndCatalogsForOrganization(
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

  // Group catalogs by product ID
  const catalogsByProductId = new Map<string, Catalog.ClientRecord>()
  filteredProducts.forEach((p) => {
    if (p.catalog) {
      catalogsByProductId.set(p.product.id, p.catalog)
    }
  })

  // Format products with prices and catalogs
  const products = uniqueProducts.map((product) => ({
    product,
    prices: pricesByProductId.get(product.id) ?? [],
    catalog: catalogsByProductId.get(product.id),
  }))

  // Sort products by creation date
  products.sort(
    (a, b) =>
      b.product.createdAt.getTime() - a.product.createdAt.getTime()
  )

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
      const catalogsForProducts = await selectCatalogs(
        {
          id: data.map((product) => product.catalogId),
        },
        transaction
      )
      const pricesByProductId: Record<string, Price.ClientRecord[]> =
        groupBy((p) => p.productId, pricesForProducts)
      const catalogsById: Record<string, Catalog.ClientRecord[]> =
        groupBy((c) => c.id, catalogsForProducts)

      // Format products with prices and catalogs
      return data.map((product) => ({
        product,
        prices: pricesByProductId[product.id] ?? [],
        catalog: catalogsById[product.catalogId]?.[0],
      }))
    }
  )
