import {
  and,
  asc,
  desc,
  eq,
  inArray,
  type SQLWrapper,
} from 'drizzle-orm'
import { z } from 'zod'
import {
  Price,
  type ProductWithPrices,
  prices,
  pricesClientSelectSchema,
  pricesInsertSchema,
  pricesSelectSchema,
  pricesTableRowDataSchema,
  pricesUpdateSchema,
} from '@/db/schema/prices'
import {
  createBulkInsertFunction,
  createBulkInsertOrDoNothingFunction,
  createCursorPaginatedSelectFunction,
  createDerivePricingModelId,
  createDerivePricingModelIds,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectByIdResult,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { FeatureType, PriceType } from '@/types'
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import { getNoChargeSlugForMeter } from '@/utils/usage/noChargePriceHelpers'
import {
  type Feature,
  features,
  featuresSelectSchema,
  resourceFeatureSelectSchema,
} from '../schema/features'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import {
  pricingModels,
  pricingModelsSelectSchema,
} from '../schema/pricingModels'
import {
  productFeatures,
  productFeaturesSelectSchema,
} from '../schema/productFeatures'
import {
  type Product,
  products,
  productsSelectSchema,
} from '../schema/products'
import { selectCustomerById } from './customerMethods'
import {
  selectPricingModelForCustomer,
  selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere,
} from './pricingModelMethods'
import {
  derivePricingModelIdFromProduct,
  pricingModelIdsForProducts,
  selectProductById,
  selectProducts,
} from './productMethods'
import {
  derivePricingModelIdFromUsageMeter,
  pricingModelIdsForUsageMeters,
  selectUsageMeterById,
} from './usageMeterMethods'

const config: ORMMethodCreatorConfig<
  typeof prices,
  typeof pricesSelectSchema,
  typeof pricesInsertSchema,
  typeof pricesUpdateSchema
> = {
  selectSchema: pricesSelectSchema,
  insertSchema: pricesInsertSchema,
  updateSchema: pricesUpdateSchema,
  tableName: 'prices',
}

/**
 * Derives the pricingModelId for a price insert by looking up the associated
 * product or usage meter.
 *
 * @param priceInsert - The price insert object
 * @param transaction - Database transaction
 * @returns The pricingModelId (either provided or derived)
 * @throws Error if pricingModelId cannot be determined
 */
export const derivePricingModelIdForPrice = async (
  priceInsert: Price.Insert,
  transaction: DbTransaction
): Promise<string> => {
  let pricingModelId = priceInsert.pricingModelId

  if (!pricingModelId) {
    if (priceInsert.productId) {
      pricingModelId = await derivePricingModelIdFromProduct(
        priceInsert.productId,
        transaction
      )
    } else if (priceInsert.usageMeterId) {
      pricingModelId = await derivePricingModelIdFromUsageMeter(
        priceInsert.usageMeterId,
        transaction
      )
    }
  }

  if (!pricingModelId) {
    throw new Error(
      `Pricing model id must be provided or derivable from productId or usageMeterId. ` +
        `Got productId: ${priceInsert.productId}, usageMeterId: ${priceInsert.usageMeterId}`
    )
  }

  return pricingModelId
}

export const selectPriceById = createSelectByIdResult(prices, config)

/**
 * Derives pricingModelId from a price by reading directly from the price table.
 * Used for subscriptions and purchases.
 * Note: Changed from going through product to reading directly from price.
 */
export const derivePricingModelIdFromPrice =
  createDerivePricingModelId(prices, config, async (id, tx) =>
    (await selectPriceById(id, tx)).unwrap()
  )

/**
 * Batch fetch pricingModelIds for multiple prices.
 * More efficient than calling derivePricingModelIdFromPrice for each price individually.
 * Used by bulk insert operations in purchases and subscriptions.
 */
export const pricingModelIdsForPrices = createDerivePricingModelIds(
  prices,
  config
)

const baseBulkInsertPrices = createBulkInsertFunction(prices, config)

/**
 * Enriches price inserts with pricingModelId by deriving from productId or usageMeterId.
 * Used by bulk insert operations to batch the lookups efficiently.
 */
const enrichPriceInsertsWithPricingModelIds = async (
  priceInserts: Price.Insert[],
  transaction: DbTransaction
): Promise<Price.Insert[]> => {
  // Get productIds from non-usage prices
  const productIds = priceInserts
    .filter(
      (insert) =>
        insert.productId !== null && insert.productId !== undefined
    )
    .map((insert) => insert.productId as string)
  // Get usageMeterIds from usage prices
  const usageMeterIds = priceInserts
    .filter(
      (insert) =>
        insert.usageMeterId !== null &&
        insert.usageMeterId !== undefined
    )
    .map((insert) => insert.usageMeterId as string)

  const productPricingModelIdMap =
    productIds.length > 0
      ? await pricingModelIdsForProducts(productIds, transaction)
      : new Map<string, string>()
  const usageMeterPricingModelIdMap =
    usageMeterIds.length > 0
      ? await pricingModelIdsForUsageMeters(
          usageMeterIds,
          transaction
        )
      : new Map<string, string>()

  return priceInserts.map((priceInsert): Price.Insert => {
    // Use provided pricingModelId, or derive from product or usage meter
    let pricingModelId = priceInsert.pricingModelId
    if (!pricingModelId) {
      if (priceInsert.productId) {
        pricingModelId = productPricingModelIdMap.get(
          priceInsert.productId
        )
      } else if (priceInsert.usageMeterId) {
        pricingModelId = usageMeterPricingModelIdMap.get(
          priceInsert.usageMeterId
        )
      }
    }
    if (!pricingModelId) {
      // Use the same error message format as derivePricingModelIdForPrice
      throw new Error(
        `Pricing model id must be provided or derivable from productId or usageMeterId. ` +
          `Got productId: ${priceInsert.productId}, usageMeterId: ${priceInsert.usageMeterId}`
      )
    }
    return {
      ...priceInsert,
      pricingModelId,
    }
  })
}

export const bulkInsertPrices = async (
  priceInserts: Price.Insert[],
  ctx: TransactionEffectsContext
): Promise<Price.Record[]> => {
  const pricesWithPricingModelId =
    await enrichPriceInsertsWithPricingModelIds(
      priceInserts,
      ctx.transaction
    )
  const results = await baseBulkInsertPrices(
    pricesWithPricingModelId,
    ctx.transaction
  )

  // Invalidate prices cache for all affected pricing models (queued for after commit)
  const pricingModelIds = [
    ...new Set(results.map((p) => p.pricingModelId)),
  ]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.pricesByPricingModel(pricingModelId)
    )
  }

  return results
}

export const selectPrices = createSelectFunction(prices, config)

/**
 * Select prices by pricing model ID with caching.
 * Cached by default; pass { ignoreCache: true } to bypass.
 */
export const selectPricesByPricingModelId = cached(
  {
    namespace: RedisKeyNamespace.PricesByPricingModel,
    keyFn: (pricingModelId: string, _transaction: DbTransaction) =>
      pricingModelId,
    schema: pricesClientSelectSchema.array(),
    dependenciesFn: (prices, pricingModelId: string) => [
      // Set membership: invalidate when prices are added/removed from pricing model
      CacheDependency.pricesByPricingModel(pricingModelId),
      // Content: invalidate when any returned price's data changes
      ...prices.map((p) => CacheDependency.price(p.id)),
    ],
  },
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<Price.ClientRecord[]> => {
    const result = await selectPrices({ pricingModelId }, transaction)
    return result.map((price) =>
      pricesClientSelectSchema.parse(price)
    )
  }
)

const baseInsertPrice = createInsertFunction(prices, config)

// Note: Queries pricingModelId per row. Use bulkInsertPrices for batch inserts.
export const insertPrice = async (
  priceInsert: Price.Insert,
  ctx: TransactionEffectsContext
): Promise<Price.Record> => {
  const pricingModelId = await derivePricingModelIdForPrice(
    priceInsert,
    ctx.transaction
  )
  const result = await baseInsertPrice(
    {
      ...priceInsert,
      pricingModelId,
    },
    ctx.transaction
  )
  // Invalidate prices cache for the pricing model (queued for after commit)
  ctx.invalidateCache(
    CacheDependency.pricesByPricingModel(result.pricingModelId)
  )
  return result
}

const baseUpdatePrice = createUpdateFunction(prices, config)

export const updatePrice = async (
  price: Price.Update,
  ctx: TransactionEffectsContext
): Promise<Price.Record> => {
  const result = await baseUpdatePrice(price, ctx.transaction)
  // Invalidate content cache (queued for after commit)
  // Price data changed (amount, currency, active, etc.)
  ctx.invalidateCache(CacheDependency.price(result.id))
  return result
}

/**
 * Selects prices and products for an organization.
 * Uses innerJoin to only include prices that have an associated product.
 * Filters by pricingModel's organizationId.
 */
export const selectPricesAndProductsForOrganization = async (
  whereConditions: Partial<Price.Record>,
  organizationId: string,
  transaction: DbTransaction
): Promise<{ price: Price.Record; product: Product.Record }[]> => {
  let query = transaction
    .select({
      price: prices,
      product: products,
    })
    .from(prices)
    // innerJoin: all callers only want product-attached prices
    .innerJoin(products, eq(products.id, prices.productId))
    .innerJoin(
      pricingModels,
      eq(prices.pricingModelId, pricingModels.id)
    )
    .$dynamic()

  const whereClauses: SQLWrapper[] = [
    eq(pricingModels.organizationId, organizationId),
  ]
  if (Object.keys(whereConditions).length > 0) {
    const whereClause = whereClauseFromObject(prices, whereConditions)
    if (whereClause) {
      whereClauses.push(whereClause)
    }
  }
  query = query.where(and(...whereClauses))

  const results = await query
  return results.map((result) => ({
    product: productsSelectSchema.parse(result.product),
    price: pricesSelectSchema.parse(result.price),
  }))
}

/**
 * Selects prices, products, and pricing models for an organization.
 * Uses innerJoin for products to only include prices that have an associated product.
 * Filters by pricingModel's organizationId.
 */
export const selectPricesProductsAndPricingModelsForOrganization =
  async (
    whereConditions: Partial<Price.Record>,
    organizationId: string,
    transaction: DbTransaction
  ): Promise<
    {
      price: Price.Record
      product: Product.Record
      pricingModel: z.infer<typeof pricingModelsSelectSchema>
    }[]
  > => {
    let query = transaction
      .select({
        price: prices,
        product: products,
        pricingModel: pricingModels,
      })
      .from(prices)
      // innerJoin: all callers only want product-attached prices
      .innerJoin(products, eq(products.id, prices.productId))
      .innerJoin(
        pricingModels,
        eq(prices.pricingModelId, pricingModels.id)
      )
      .$dynamic()

    const whereClauses: SQLWrapper[] = [
      eq(pricingModels.organizationId, organizationId),
    ]
    if (Object.keys(whereConditions).length > 0) {
      const whereClause = whereClauseFromObject(
        prices,
        whereConditions
      )
      if (whereClause) {
        whereClauses.push(whereClause)
      }
    }
    query = query.where(and(...whereClauses))

    const results = await query
    return results.map((result) => ({
      product: productsSelectSchema.parse(result.product),
      price: pricesSelectSchema.parse(result.price),
      pricingModel: pricingModelsSelectSchema.parse(
        result.pricingModel
      ),
    }))
  }

const priceProductJoinResultToProductAndPrices = (
  result: {
    price: Price.Record
    product: Product.Record
    feature?: Feature.Record
  }[]
): ProductWithPrices[] => {
  const productMap = new Map<string, Product.Record>()
  const pricesMap = new Map<string, Price.Record>()
  const productFeaturesMap = new Map<string, Set<string>>()
  const featureMap = new Map<string, Feature.Record>()

  result.forEach((item) => {
    productMap.set(item.product.id, item.product)
    pricesMap.set(item.price.id, item.price)
    if (item.feature) {
      featureMap.set(item.feature.id, item.feature)
      // Track which features belong to which product
      if (!productFeaturesMap.has(item.product.id)) {
        productFeaturesMap.set(item.product.id, new Set())
      }
      productFeaturesMap.get(item.product.id)!.add(item.feature.id)
    }
  })

  const products = Array.from(productMap.values())
  const prices = Array.from(pricesMap.values())
  const sortedPrices = prices.sort(
    (a, b) => a.createdAt - b.createdAt
  )

  return products.map((product): ProductWithPrices => {
    const productFeatureIds =
      productFeaturesMap.get(product.id) || new Set()
    const productFeatures = Array.from(productFeatureIds)
      .map((featureId) => featureMap.get(featureId))
      .filter(
        (feature): feature is Feature.Record => feature !== undefined
      )

    const productPrices = sortedPrices.filter(
      (price) => price.productId === product.id
    )

    return {
      ...product,
      prices: productPrices,
      defaultPrice:
        productPrices.find((price) => price.isDefault) ??
        productPrices[0],
      features: productFeatures,
    }
  })
}

const priceProductFeatureSchema = z.object({
  price: pricesSelectSchema,
  product: productsSelectSchema,
  feature: featuresSelectSchema.optional(),
})

type PriceProductFeature = z.infer<typeof priceProductFeatureSchema>

export const selectPricesAndProductsByProductWhere = async (
  whereConditions: SelectConditions<typeof products>,
  transaction: DbTransaction
): Promise<ProductWithPrices[]> => {
  const results = await transaction
    .select({
      price: prices,
      product: products,
      feature: features,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .leftJoin(
      productFeatures,
      eq(products.id, productFeatures.productId)
    )
    .leftJoin(features, eq(productFeatures.featureId, features.id))
    .where(whereClauseFromObject(products, whereConditions))
    .orderBy(asc(products.createdAt))

  const parsedResults: PriceProductFeature[] =
    priceProductFeatureSchema.array().parse(
      results.map((item) => {
        return {
          ...item,
          /**
           * Returns null if feature is not found,
           * undefined makes this pass the .optional() check
           */
          feature: item.feature ?? undefined,
        }
      })
    )

  return priceProductJoinResultToProductAndPrices(parsedResults)
}

export const selectPricesAndProductByProductId = async (
  productId: string,
  transaction: DbTransaction
): Promise<ProductWithPrices> => {
  const results = await selectPricesAndProductsByProductWhere(
    { id: productId },
    transaction
  )
  if (!results.length) {
    throw new Error(
      `selectPricesAndProductByProductId: No product found with id ${productId}`
    )
  }
  return results[0]
}

export const selectDefaultPriceAndProductByProductId = async (
  productId: string,
  transaction: DbTransaction
): Promise<{
  defaultPrice: Price.ClientRecord
  product: Omit<ProductWithPrices, 'prices'>
}> => {
  const { prices, ...product } =
    await selectPricesAndProductByProductId(productId, transaction)

  const defaultPrice =
    prices.find((price) => price.isDefault) ?? prices[0]

  if (!defaultPrice) {
    throw new Error(`No default price found for product ${productId}`)
  }
  return {
    defaultPrice,
    product,
  }
}

/**
 * Selects price, product, and organization by price where conditions.
 * Uses innerJoin for products: all callers either throw for usage prices or don't use product.
 * Gets organization via pricingModel to ensure consistent organization lookup.
 */
export const selectPriceProductAndOrganizationByPriceWhere = async (
  whereConditions: Price.Where,
  transaction: DbTransaction
): Promise<
  {
    price: Price.Record
    product: Product.Record
    organization: z.infer<typeof organizationsSelectSchema>
  }[]
> => {
  let query = transaction
    .select({
      price: prices,
      product: products,
      organization: organizations,
    })
    .from(prices)
    // innerJoin: all callers either throw for usage prices or don't use product
    .innerJoin(products, eq(products.id, prices.productId))
    .innerJoin(
      pricingModels,
      eq(prices.pricingModelId, pricingModels.id)
    )
    .innerJoin(
      organizations,
      eq(pricingModels.organizationId, organizations.id)
    )
    .$dynamic()

  const whereClause = whereClauseFromObject(prices, whereConditions)
  if (whereClause) {
    query = query.where(whereClause)
  }

  const results = await query
  return results.map((result) => ({
    price: pricesSelectSchema.parse(result.price),
    product: productsSelectSchema.parse(result.product),
    organization: organizationsSelectSchema.parse(
      result.organization
    ),
  }))
}

/**
 * Selects a price by slug for a given customer.
 * Price slugs are scoped to the customer's pricing model (customer.pricingModelId or default pricing model).
 *
 * Returns Price.ClientRecord (not Price.Record) because it uses data from selectPricingModelForCustomer
 * which returns client records. The client record has all business logic fields but omits metadata fields
 * (externalId, position, createdByCommit, updatedByCommit).
 *
 * @param params - Object containing slug and customerId
 * @param transaction - Database transaction
 * @returns The price client record if found, null otherwise
 * @throws {Error} If the customer's pricing model cannot be found (e.g., no default pricing model exists for the organization)
 */
export const selectPriceBySlugAndCustomerId = async (
  params: { slug: string; customerId: string },
  transaction: DbTransaction
): Promise<Price.ClientRecord | null> => {
  // First, get the customer to determine their pricing model
  const customer = await selectCustomerById(
    params.customerId,
    transaction
  )

  // Get the pricing model for the customer (includes products and prices)
  // Note: selectPricingModelForCustomer already filters for active prices
  const pricingModel = await selectPricingModelForCustomer(
    customer,
    transaction
  )

  // Search through all products in the pricing model to find a price with the matching slug
  // Use find() for cleaner code - prices are already filtered to active ones
  for (const product of pricingModel.products) {
    const price = product.prices.find((p) => p.slug === params.slug)
    if (price) {
      // Return the price directly from the pricing model
      // This avoids a redundant database call since we already have the price data
      return price
    }
  }

  // Also search for usage prices that don't have a productId
  // (usage prices belong to usage meters, not products)
  const usagePrices = await transaction
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.slug, params.slug),
        eq(prices.pricingModelId, pricingModel.id),
        eq(prices.active, true),
        eq(prices.type, PriceType.Usage)
      )
    )

  if (usagePrices.length > 0) {
    return pricesClientSelectSchema.parse(usagePrices[0])
  }

  return null
}

/**
 * Select a price by slug and organizationId (uses the organization's default pricing model)
 * This is used for anonymous checkout sessions where we don't have a customer
 * Returns Price.ClientRecord (not Price.Record) because it uses data from selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere
 */
export const selectPriceBySlugForDefaultPricingModel = async (
  params: { slug: string; organizationId: string; livemode: boolean },
  transaction: DbTransaction
): Promise<Price.ClientRecord | null> => {
  // Get the organization's default pricing model
  const [pricingModel] =
    await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
      {
        isDefault: true,
        organizationId: params.organizationId,
        livemode: params.livemode,
      },
      transaction
    )

  if (!pricingModel) {
    throw new Error(
      `No default pricing model found for organization ${params.organizationId}`
    )
  }

  // Search through all products in the pricing model to find a price with the matching slug
  // (inactive products and prices are already filtered out by selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere)
  for (const product of pricingModel.products) {
    const price = product.prices.find(
      (p: Price.ClientRecord) => p.slug === params.slug
    )
    if (price) {
      return price
    }
  }

  // Also search for usage prices that don't have a productId
  // (usage prices belong to usage meters, not products)
  const usagePrices = await transaction
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.slug, params.slug),
        eq(prices.pricingModelId, pricingModel.id),
        eq(prices.active, true),
        eq(prices.type, PriceType.Usage)
      )
    )

  if (usagePrices.length > 0) {
    return pricesClientSelectSchema.parse(usagePrices[0])
  }

  return null
}

export const selectPricesPaginated = createPaginatedSelectFunction(
  prices,
  config
)

/**
 * Re-export pricesTableRowDataSchema for backwards compatibility.
 * The canonical schema is defined in @/db/schema/prices.
 */
export const pricesTableRowOutputSchema = pricesTableRowDataSchema

export const selectPricesTableRowData =
  createCursorPaginatedSelectFunction(
    prices,
    config,
    pricesTableRowDataSchema,
    async (
      priceRecords: Price.Record[],
      transaction: DbTransaction
    ) => {
      // Only get products for prices that have productId (non-usage prices)
      const productIds = priceRecords
        .filter((price) => Price.hasProductId(price))
        .map((price) => price.productId)
      const products =
        productIds.length > 0
          ? await selectProducts({ id: productIds }, transaction)
          : []
      const productsById = new Map(
        products.map((product: Product.Record) => [
          product.id,
          product,
        ])
      )

      return priceRecords.map((price) => {
        // Usage prices belong to usage meters, not products (productId is null).
        // Only fetch product data for subscription/single_payment prices.
        // Product may also be null if it was deleted.
        let productInfo: { id: string; name: string } | null = null
        if (Price.hasProductId(price)) {
          const product = productsById.get(price.productId)
          if (product) {
            productInfo = { id: product.id, name: product.name }
          }
        }
        return { price, product: productInfo }
      })
    },
    // Searchable columns for ILIKE search on name and slug
    [prices.name, prices.slug],
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

      return eq(prices.id, trimmedQuery)
    }
  )

export const makePriceDefault = async (
  priceOrId: Price.Record | string,
  ctx: TransactionEffectsContext
) => {
  const newDefaultPrice =
    typeof priceOrId === 'string'
      ? (await selectPriceById(priceOrId, ctx.transaction)).unwrap()
      : priceOrId

  const { price: oldDefaultPrice } = (
    await selectPriceProductAndOrganizationByPriceWhere(
      { isDefault: true },
      ctx.transaction
    )
  )[0]

  if (oldDefaultPrice) {
    await updatePrice(
      {
        id: oldDefaultPrice.id,
        isDefault: false,
        type: oldDefaultPrice.type,
      },
      ctx
    )
  }

  const updatedPrice = await updatePrice(
    {
      id: newDefaultPrice.id,
      isDefault: true,
      type: newDefaultPrice.type,
    },
    ctx
  )
  return updatedPrice
}

export const subscriptionPriceTypes = [
  PriceType.Subscription,
  PriceType.Usage,
]

export const isPriceTypeSubscription = (
  priceType: Price.Record['type']
) => {
  return subscriptionPriceTypes.includes(priceType)
}

const bulkInsertOrDoNothingPrices =
  createBulkInsertOrDoNothingFunction(prices, config)

export const bulkInsertOrDoNothingPricesByExternalId = async (
  priceInserts: Price.Insert[],
  ctx: TransactionEffectsContext
) => {
  const pricesWithPricingModelId =
    await enrichPriceInsertsWithPricingModelIds(
      priceInserts,
      ctx.transaction
    )
  const results = await bulkInsertOrDoNothingPrices(
    pricesWithPricingModelId,
    [prices.externalId, prices.productId],
    ctx.transaction
  )

  // Invalidate prices cache for all affected pricing models (queued for after commit)
  const pricingModelIds = [
    ...new Set(results.map((p) => p.pricingModelId)),
  ]
  for (const pricingModelId of pricingModelIds) {
    ctx.invalidateCache(
      CacheDependency.pricesByPricingModel(pricingModelId)
    )
  }

  return results
}

const setPricesForProductToNonDefault = async (
  productId: string,
  transaction: DbTransaction
) => {
  await transaction
    .update(prices)
    .set({ isDefault: false })
    .where(eq(prices.productId, productId))
}

const setPricesForProductToNonDefaultNonActive = async (
  productId: string,
  transaction: DbTransaction
) => {
  await transaction
    .update(prices)
    .set({ isDefault: false, active: false })
    .where(eq(prices.productId, productId))
}

/**
 * Sets all prices for a usage meter to non-default.
 * Used when setting a new price as default to clear the previous default.
 *
 * IMPORTANT: This unsets ALL defaults regardless of `active` status because
 * the unique constraint on `isDefault` applies regardless of `active`.
 * If we only unset active defaults, inactive defaults could violate the constraint.
 *
 * @param usageMeterId - The ID of the usage meter
 * @param transaction - Database transaction
 */
export const setPricesForUsageMeterToNonDefault = async (
  usageMeterId: string,
  transaction: DbTransaction
): Promise<void> => {
  await transaction
    .update(prices)
    .set({ isDefault: false })
    .where(
      and(
        eq(prices.usageMeterId, usageMeterId),
        eq(prices.isDefault, true)
      )
    )
}

/**
 * Selects the default price for a usage meter.
 * Returns only ACTIVE defaults, as inactive prices shouldn't be used
 * as the default for new usage events.
 *
 * @param usageMeterId - The ID of the usage meter
 * @param transaction - Database transaction
 * @returns The default price record if found, null otherwise
 */
export const selectDefaultPriceForUsageMeter = async (
  usageMeterId: string,
  transaction: DbTransaction
): Promise<Price.Record | null> => {
  const result = await transaction
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.usageMeterId, usageMeterId),
        eq(prices.isDefault, true),
        eq(prices.active, true)
      )
    )
    .limit(1)
  if (result.length === 0) {
    return null
  }
  return pricesSelectSchema.parse(result[0])
}

/**
 * Batch selects default prices for multiple usage meters.
 * More efficient than calling selectDefaultPriceForUsageMeter for each meter individually.
 * Returns only ACTIVE defaults, as inactive prices shouldn't be used
 * as the default for new usage events.
 *
 * @param usageMeterIds - Array of usage meter IDs
 * @param transaction - Database transaction
 * @returns Map of usageMeterId to default Price.Record (meters without default prices are not included)
 */
export const selectDefaultPricesForUsageMeters = async (
  usageMeterIds: string[],
  transaction: DbTransaction
): Promise<Map<string, Price.Record>> => {
  if (usageMeterIds.length === 0) {
    return new Map()
  }

  const results = await transaction
    .select()
    .from(prices)
    .where(
      and(
        inArray(prices.usageMeterId, usageMeterIds),
        eq(prices.isDefault, true),
        eq(prices.active, true)
      )
    )

  const defaultPriceByUsageMeterId = new Map<string, Price.Record>()
  for (const result of results) {
    const price = pricesSelectSchema.parse(result)
    if (price.usageMeterId) {
      defaultPriceByUsageMeterId.set(price.usageMeterId, price)
    }
  }

  return defaultPriceByUsageMeterId
}

/**
 * Ensures a usage meter has a default price.
 * If no default price exists, sets the no_charge price as the default.
 * This is called when the current default price is unset or deactivated.
 *
 * @param usageMeterId - The ID of the usage meter
 * @param ctx - TransactionEffectsContext for transaction and cache invalidation
 * @throws Error if the usage meter is not found
 * @throws Error if the no_charge price is not found
 */
export const ensureUsageMeterHasDefaultPrice = async (
  usageMeterId: string,
  ctx: TransactionEffectsContext
): Promise<void> => {
  // Check if meter has any active default price
  const defaultPrice = await selectDefaultPriceForUsageMeter(
    usageMeterId,
    ctx.transaction
  )
  if (defaultPrice) {
    return // Already has a default
  }

  // Set the no_charge price as default
  const usageMeter = await selectUsageMeterById(
    usageMeterId,
    ctx.transaction
  )
  if (!usageMeter) {
    throw new Error(`Usage meter ${usageMeterId} not found`)
  }

  const noChargeSlug = getNoChargeSlugForMeter(usageMeter.slug)

  // Find the no_charge price for this meter
  const noChargePrices = await selectPrices(
    {
      slug: noChargeSlug,
      usageMeterId,
    },
    ctx.transaction
  )

  if (noChargePrices.length === 0) {
    throw new Error(
      `No charge price with slug ${noChargeSlug} not found for usage meter ${usageMeterId}`
    )
  }

  const noChargePrice = noChargePrices[0]

  // IMPORTANT: First unset ALL defaults (including inactive ones)
  // The unique constraint on isDefault applies regardless of active status
  await setPricesForUsageMeterToNonDefault(
    usageMeterId,
    ctx.transaction
  )

  // Set the no_charge price as default and ensure it's active
  // The no_charge price may have been inactive, so we explicitly set active: true
  await updatePrice(
    {
      id: noChargePrice.id,
      isDefault: true,
      type: noChargePrice.type,
      active: true,
    },
    ctx
  )
}

const baseDangerouslyInsertPrice = createInsertFunction(
  prices,
  config
)

export const dangerouslyInsertPrice = async (
  priceInsert: Price.Insert,
  ctx: TransactionEffectsContext
): Promise<Price.Record> => {
  const pricingModelId = await derivePricingModelIdForPrice(
    priceInsert,
    ctx.transaction
  )
  const result = await baseDangerouslyInsertPrice(
    {
      ...priceInsert,
      pricingModelId,
    },
    ctx.transaction
  )
  // Invalidate prices cache for the pricing model (queued for after commit)
  ctx.invalidateCache(
    CacheDependency.pricesByPricingModel(result.pricingModelId)
  )
  return result
}

/**
 * Inserts a new price, archiving any existing prices for the same product.
 * Usage meters can have multiple active prices, so those are not archived here.
 * When editing a usage price creates a new one, the caller archives the old price.
 *
 * For product prices: always sets isDefault=true (archives existing prices first).
 * For usage prices: respects the isDefault value from input, and if true,
 * sets other prices for the same meter to non-default.
 */
export const safelyInsertPrice = async (
  price: Omit<Price.Insert, 'isDefault' | 'active'> & {
    isDefault?: boolean
  },
  ctx: TransactionEffectsContext
) => {
  if (price.productId) {
    await setPricesForProductToNonDefaultNonActive(
      price.productId,
      ctx.transaction
    )
  }

  // Determine isDefault value:
  // - Product prices: always default (other prices are archived above)
  // - Usage prices: use the provided value, defaulting to false if not specified
  const isDefault =
    price.type === PriceType.Usage ? (price.isDefault ?? false) : true

  // For usage prices being set as default, reset other prices for the same meter
  if (
    price.type === PriceType.Usage &&
    isDefault &&
    price.usageMeterId
  ) {
    await setPricesForUsageMeterToNonDefault(
      price.usageMeterId,
      ctx.transaction
    )
  }

  const priceInsert: Price.Insert = pricesInsertSchema.parse({
    ...price,
    isDefault,
    active: true,
  })
  return dangerouslyInsertPrice(priceInsert, ctx)
}

export const safelyUpdatePrice = async (
  price: Price.Update,
  ctx: TransactionEffectsContext
) => {
  /**
   * If price is being set as default, reset other prices for the same product/meter
   */
  if (price.isDefault) {
    const existingPrice = (
      await selectPriceById(price.id, ctx.transaction)
    ).unwrap()
    // For non-usage prices, reset other prices for the same product
    if (Price.hasProductId(existingPrice)) {
      await setPricesForProductToNonDefault(
        existingPrice.productId,
        ctx.transaction
      )
    }
    // For usage prices, reset other prices for the same usage meter
    if (
      existingPrice.type === PriceType.Usage &&
      existingPrice.usageMeterId
    ) {
      await setPricesForUsageMeterToNonDefault(
        existingPrice.usageMeterId,
        ctx.transaction
      )
    }
  }
  return updatePrice(price, ctx)
}

/**
 * Selects a price by slug within a specific pricing model.
 * Price slugs are scoped to a pricing model, so we need the pricingModelId to resolve.
 *
 * @param params - Object containing slug and pricingModelId
 * @param transaction - Database transaction
 * @returns The price record if found, null otherwise
 */
export const selectPriceBySlugAndPricingModelId = async (
  params: { slug: string; pricingModelId: string },
  transaction: DbTransaction
): Promise<Price.Record | null> => {
  const result = await selectPrices(
    {
      slug: params.slug,
      pricingModelId: params.pricingModelId,
      active: true,
    },
    transaction
  )

  if (result.length === 0) {
    return null
  }

  return result[0]
}

/**
 * Selects Resource features for a given price.
 * Used for validating resource capacity during subscription adjustments.
 *
 * Returns features with type=Resource that are linked to the price's product
 * via productFeatures, including the feature's amount, slug, and resourceId.
 *
 * @param priceId - The ID of the price to get resource features for
 * @param transaction - Database transaction
 * @returns Array of Resource feature records
 */
export const selectResourceFeaturesForPrice = async (
  priceId: string,
  transaction: DbTransaction
): Promise<Feature.ResourceRecord[]> => {
  // Get the price to find its productId
  const price = (await selectPriceById(priceId, transaction)).unwrap()

  // Usage prices don't have products, so they can't have resource features
  if (price.productId === null) {
    return []
  }

  // Query productFeatures joined with features, filtering for Resource type
  // and non-expired productFeatures
  const results = await transaction
    .select({
      feature: features,
      productFeature: productFeatures,
    })
    .from(productFeatures)
    .innerJoin(features, eq(productFeatures.featureId, features.id))
    .where(
      and(
        eq(productFeatures.productId, price.productId),
        eq(features.type, FeatureType.Resource),
        eq(features.active, true)
      )
    )

  // Filter for non-expired productFeatures and parse as Resource features
  return results
    .filter(
      (result) =>
        result.productFeature.expiredAt === null ||
        result.productFeature.expiredAt > Date.now()
    )
    .map((result) =>
      resourceFeatureSelectSchema.parse(result.feature)
    )
}

/**
 * Batch selects Resource features for multiple prices.
 * More efficient than calling selectResourceFeaturesForPrice for each price individually.
 *
 * Returns a Map of priceId -> Resource features for that price.
 *
 * @param priceIds - Array of price IDs to get resource features for
 * @param transaction - Database transaction
 * @returns Map of priceId to array of Resource feature records
 */
export const selectResourceFeaturesForPrices = async (
  priceIds: string[],
  transaction: DbTransaction
): Promise<Map<string, Feature.ResourceRecord[]>> => {
  if (priceIds.length === 0) {
    return new Map()
  }

  // Fetch all prices to get their productIds
  const priceRecords = await selectPrices(
    { id: priceIds },
    transaction
  )
  const priceIdToProductId = new Map(
    priceRecords.map((p) => [p.id, p.productId])
  )
  // Filter out null productIds (usage prices don't have products)
  const productIds = [
    ...new Set(
      priceRecords
        .map((p) => p.productId)
        .filter((id): id is string => id !== null)
    ),
  ]

  if (productIds.length === 0) {
    return new Map()
  }

  // Query productFeatures joined with features for all products at once
  const results = await transaction
    .select({
      feature: features,
      productFeature: productFeatures,
    })
    .from(productFeatures)
    .innerJoin(features, eq(productFeatures.featureId, features.id))
    .where(
      and(
        inArray(productFeatures.productId, productIds),
        eq(features.type, FeatureType.Resource),
        eq(features.active, true)
      )
    )

  // Filter for non-expired productFeatures
  const now = Date.now()
  const validResults = results.filter(
    (result) =>
      result.productFeature.expiredAt === null ||
      result.productFeature.expiredAt > now
  )

  // Build a map of productId -> Resource features
  const productIdToFeatures = new Map<
    string,
    Feature.ResourceRecord[]
  >()
  const productIdToLatestByResourceId = new Map<
    string,
    Map<string, Feature.ResourceRecord>
  >()
  for (const result of validResults) {
    const productId = result.productFeature.productId
    const feature = resourceFeatureSelectSchema.parse(result.feature)
    const resourceId = feature.resourceId
    if (!resourceId) {
      continue
    }

    const existingMapForProduct =
      productIdToLatestByResourceId.get(productId) ??
      new Map<string, Feature.ResourceRecord>()

    const existingForResource = existingMapForProduct.get(resourceId)
    if (
      !existingForResource ||
      feature.createdAt > existingForResource.createdAt
    ) {
      existingMapForProduct.set(resourceId, feature)
      productIdToLatestByResourceId.set(
        productId,
        existingMapForProduct
      )
    }
  }

  // Materialize arrays for output map
  for (const [
    productId,
    latestByResourceId,
  ] of productIdToLatestByResourceId) {
    productIdToFeatures.set(
      productId,
      Array.from(latestByResourceId.values())
    )
  }

  // Map priceIds back to their features via productId
  // Spread arrays to create independent copies - prices sharing the same productId
  // should not share array references to prevent mutation side effects
  const priceIdToFeatures = new Map<
    string,
    Feature.ResourceRecord[]
  >()
  for (const priceId of priceIds) {
    const productId = priceIdToProductId.get(priceId)
    if (productId) {
      priceIdToFeatures.set(priceId, [
        ...(productIdToFeatures.get(productId) ?? []),
      ])
    } else {
      priceIdToFeatures.set(priceId, [])
    }
  }

  return priceIdToFeatures
}
