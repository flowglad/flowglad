import { and, eq, inArray, isNull, notExists, sql } from 'drizzle-orm'
import * as R from 'ramda'
import { z } from 'zod'
import { payments } from '@/db/schema/payments'
import {
  Price,
  prices,
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
import { purchases } from '@/db/schema/purchases'
import { subscriptions } from '@/db/schema/subscriptions'
import {
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  createUpsertFunction,
  type ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import { PaymentStatus, PriceType } from '@/types'
import {
  CacheDependency,
  cached,
  invalidateDependencies,
} from '@/utils/cache'
import { groupBy } from '@/utils/core'
import { RedisKeyNamespace } from '@/utils/redis'
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

/**
 * Select products by pricing model ID with caching.
 * Cached by default; pass { ignoreCache: true } to bypass.
 */
export const selectProductsByPricingModelId = cached(
  {
    namespace: RedisKeyNamespace.ProductsByPricingModel,
    keyFn: (pricingModelId: string, _transaction: DbTransaction) =>
      pricingModelId,
    schema: productsClientSelectSchema.array(),
    dependenciesFn: (_products, pricingModelId: string) => [
      CacheDependency.productsByPricingModel(pricingModelId),
    ],
  },
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<Product.ClientRecord[]> => {
    const result = await selectProducts(
      { pricingModelId },
      transaction
    )
    return result.map((product) =>
      productsClientSelectSchema.parse(product)
    )
  }
)

/**
 * Invalidate products cache for a pricing model.
 */
export const invalidateProductsByPricingModelCache = async (
  pricingModelId: string
): Promise<void> => {
  await invalidateDependencies([
    CacheDependency.productsByPricingModel(pricingModelId),
  ])
}

/**
 * Derives pricingModelId from a product.
 * Used for prices and productFeatures.
 */
export const derivePricingModelIdFromProduct =
  createDerivePricingModelId(products, config, selectProductById)

/**
 * Batch fetch pricingModelIds for multiple products.
 * More efficient than calling derivePricingModelIdFromProduct for each product individually.
 * Used by bulk insert operations in prices and productFeatures.
 */
export const pricingModelIdsForProducts = createDerivePricingModelIds(
  products,
  config
)

const baseInsertProduct = createInsertFunction(products, config)

export const insertProduct = async (
  product: Product.Insert,
  transaction: DbTransaction
): Promise<Product.Record> => {
  const result = await baseInsertProduct(product, transaction)
  // Invalidate products cache for the pricing model
  await invalidateProductsByPricingModelCache(result.pricingModelId)
  return result
}

const baseUpdateProduct = createUpdateFunction(products, config)

export const updateProduct = async (
  product: Product.Update,
  transaction: DbTransaction
): Promise<Product.Record> => {
  const result = await baseUpdateProduct(product, transaction)
  // Invalidate products cache for the pricing model
  await invalidateProductsByPricingModelCache(result.pricingModelId)
  return result
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
  const parsedResults = results.map((result) =>
    productsSelectSchema.parse(result)
  )

  // Invalidate products cache for all affected pricing models
  const pricingModelIds = [
    ...new Set(parsedResults.map((p) => p.pricingModelId)),
  ]
  await Promise.all(
    pricingModelIds.map(invalidateProductsByPricingModelCache)
  )

  return parsedResults
}

const baseBulkInsertOrDoNothingProducts =
  createBulkInsertOrDoNothingFunction(products, config)

export const bulkInsertOrDoNothingProducts = async (
  productInserts: Product.Insert[],
  conflictTarget: Parameters<
    typeof baseBulkInsertOrDoNothingProducts
  >[1],
  transaction: DbTransaction
): Promise<Product.Record[]> => {
  const results = await baseBulkInsertOrDoNothingProducts(
    productInserts,
    conflictTarget,
    transaction
  )

  // Invalidate products cache for all affected pricing models
  const pricingModelIds = [
    ...new Set(results.map((p) => p.pricingModelId)),
  ]
  if (pricingModelIds.length > 0) {
    await Promise.all(
      pricingModelIds.map(invalidateProductsByPricingModelCache)
    )
  }

  return results
}

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

/**
 * Aggregates total revenue per product from both purchases and subscriptions.
 *
 * Join paths:
 * - Purchase-based: payments → purchases (via purchaseId) → prices (via priceId) → products (via productId)
 * - Subscription-based: payments → subscriptions (via subscriptionId) → prices (via priceId) → products (via productId)
 *
 * Only counts succeeded payments, subtracting any refunded amounts.
 * Subscription payments (where purchaseId is null) are included via the subscription path
 * to avoid double-counting.
 *
 * @param productIds - Array of product IDs to aggregate revenue for
 * @param transaction - Database transaction
 * @returns Map of productId → totalRevenue (in cents)
 */
export const aggregateRevenueByProductIds = async (
  productIds: string[],
  transaction: DbTransaction
): Promise<Map<string, number>> => {
  if (productIds.length === 0) {
    return new Map()
  }

  // Query for purchase-based revenue (payments with purchaseId)
  const purchaseRevenueResults = await transaction
    .select({
      productId: prices.productId,
      totalRevenue:
        sql<number>`COALESCE(SUM(${payments.amount} - COALESCE(${payments.refundedAmount}, 0)), 0)`.mapWith(
          Number
        ),
    })
    .from(payments)
    .innerJoin(purchases, eq(payments.purchaseId, purchases.id))
    .innerJoin(prices, eq(purchases.priceId, prices.id))
    .where(
      and(
        inArray(prices.productId, productIds),
        eq(payments.status, PaymentStatus.Succeeded)
      )
    )
    .groupBy(prices.productId)

  // Query for subscription-based revenue (payments with subscriptionId but no purchaseId)
  const subscriptionRevenueResults = await transaction
    .select({
      productId: prices.productId,
      totalRevenue:
        sql<number>`COALESCE(SUM(${payments.amount} - COALESCE(${payments.refundedAmount}, 0)), 0)`.mapWith(
          Number
        ),
    })
    .from(payments)
    .innerJoin(
      subscriptions,
      eq(payments.subscriptionId, subscriptions.id)
    )
    .innerJoin(prices, eq(subscriptions.priceId, prices.id))
    .where(
      and(
        inArray(prices.productId, productIds),
        eq(payments.status, PaymentStatus.Succeeded),
        isNull(payments.purchaseId) // Only count subscription payments not linked to a purchase
      )
    )
    .groupBy(prices.productId)

  // Combine results from both queries
  const revenueMap = new Map<string, number>()

  for (const row of purchaseRevenueResults) {
    if (row.productId) {
      revenueMap.set(row.productId, row.totalRevenue)
    }
  }

  for (const row of subscriptionRevenueResults) {
    if (row.productId) {
      const existingRevenue = revenueMap.get(row.productId) ?? 0
      revenueMap.set(
        row.productId,
        existingRevenue + row.totalRevenue
      )
    }
  }

  return revenueMap
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
      const productIds = data.map((product) => product.id)

      // Fetch related data in parallel for efficiency
      const [
        pricesForProducts,
        pricingModelsForProducts,
        revenueByProduct,
      ] = await Promise.all([
        selectPrices({ productId: productIds }, transaction),
        selectPricingModels(
          { id: data.map((product) => product.pricingModelId) },
          transaction
        ),
        aggregateRevenueByProductIds(productIds, transaction),
      ])

      // Filter to only include prices with productId (non-usage prices)
      // and group by productId
      const pricesByProductId: Record<string, Price.ClientRecord[]> =
        {}
      for (const p of pricesForProducts) {
        if (Price.clientHasProductId(p)) {
          const productId = p.productId
          if (!pricesByProductId[productId]) {
            pricesByProductId[productId] = []
          }
          pricesByProductId[productId].push(p)
        }
      }
      const pricingModelsById: Record<
        string,
        PricingModel.ClientRecord[]
      > = groupBy((c) => c.id, pricingModelsForProducts)

      // Format products with prices, pricingModels, and revenue
      return data.map((product) => ({
        product,
        prices: pricesByProductId[product.id] ?? [],
        pricingModel: pricingModelsById[product.pricingModelId]?.[0],
        totalRevenue: revenueByProduct.get(product.id) ?? 0,
      }))
    },
    // Searchable columns for ILIKE search on name and slug
    [products.name, products.slug],
    /**
     * Additional search clause for exact ID match.
     * Combined with base name/slug search via OR.
     */
    ({ searchQuery }) => {
      const trimmedQuery =
        typeof searchQuery === 'string'
          ? searchQuery.trim()
          : searchQuery

      if (!trimmedQuery) return undefined

      return eq(products.id, trimmedQuery)
    },
    /**
     * Additional filter clause for excludeUsageProducts.
     * Excludes products that have any usage price.
     */
    ({ filters }) => {
      const typedFilters = filters as
        | { excludeUsageProducts?: boolean }
        | undefined
      if (!typedFilters?.excludeUsageProducts) return undefined

      // Exclude products that have any usage price
      // NOT EXISTS (SELECT 1 FROM prices WHERE prices.product_id = products.id AND prices.type = 'usage')
      return notExists(
        sql`(SELECT 1 FROM ${prices} WHERE ${prices.productId} = ${products.id} AND ${prices.type} = ${PriceType.Usage})`
      )
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
