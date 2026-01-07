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
  type PricingModelWithProductsAndUsageMeters,
  type ProductWithPrices,
  prices,
  pricesClientSelectSchema,
  pricesInsertSchema,
  pricesSelectSchema,
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
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { PriceType } from '@/types'
import {
  type Feature,
  features,
  featuresSelectSchema,
} from '../schema/features'
import {
  organizations,
  organizationsSelectSchema,
} from '../schema/organizations'
import {
  pricingModels,
  pricingModelsSelectSchema,
} from '../schema/pricingModels'
import { productFeatures } from '../schema/productFeatures'
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

export const selectPriceById = createSelectById(prices, config)

/**
 * Derives pricingModelId from a price by reading directly from the price table.
 * Used for subscriptions and purchases.
 * Note: Changed from going through product to reading directly from price.
 */
export const derivePricingModelIdFromPrice =
  createDerivePricingModelId(prices, config, selectPriceById)

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

export const bulkInsertPrices = async (
  priceInserts: Price.Insert[],
  transaction: DbTransaction
): Promise<Price.Record[]> => {
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

  const pricesWithPricingModelId = priceInserts.map(
    (priceInsert): Price.Insert => {
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
        throw new Error(
          `Pricing model id not found for price insert (productId: ${priceInsert.productId}, usageMeterId: ${priceInsert.usageMeterId})`
        )
      }
      return {
        ...priceInsert,
        pricingModelId,
      }
    }
  )
  return baseBulkInsertPrices(pricesWithPricingModelId, transaction)
}

export const selectPrices = createSelectFunction(prices, config)

const baseInsertPrice = createInsertFunction(prices, config)

export const insertPrice = async (
  priceInsert: Price.Insert,
  transaction: DbTransaction
): Promise<Price.Record> => {
  // Derive pricingModelId if not provided:
  // - For product prices: derive from product
  // - For usage prices: derive from usage meter
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
      `Pricing model id must be provided or derivable from productId or usageMeterId`
    )
  }
  return baseInsertPrice(
    {
      ...priceInsert,
      pricingModelId,
    },
    transaction
  )
}

export const updatePrice = createUpdateFunction(prices, config)

export const selectPricesAndProductsForOrganization = async (
  whereConditions: Partial<Price.Record>,
  organizationId: string,
  transaction: DbTransaction
) => {
  let query = transaction
    .select({
      price: prices,
      product: products,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .$dynamic()

  const whereClauses: SQLWrapper[] = [
    eq(products.organizationId, organizationId),
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

export const selectPricesProductsAndPricingModelsForOrganization =
  async (
    whereConditions: Partial<Price.Record>,
    organizationId: string,
    transaction: DbTransaction
  ) => {
    let query = transaction
      .select({
        price: prices,
        product: products,
        pricingModel: pricingModels,
      })
      .from(prices)
      .innerJoin(products, eq(products.id, prices.productId))
      .leftJoin(
        pricingModels,
        eq(products.pricingModelId, pricingModels.id)
      )
      .$dynamic()

    const whereClauses: SQLWrapper[] = [
      eq(products.organizationId, organizationId),
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
) => {
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

export const selectPriceProductAndOrganizationByPriceWhere = async (
  whereConditions: Price.Where,
  transaction: DbTransaction
) => {
  let query = transaction
    .select({
      price: prices,
      product: products,
      organization: organizations,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .innerJoin(
      organizations,
      eq(products.organizationId, organizations.id)
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
        eq(prices.active, true)
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

  // Filter to active products and prices, similar to selectPricingModelForCustomer
  const filteredProducts: PricingModelWithProductsAndUsageMeters['products'] =
    pricingModel.products
      .filter(
        (
          product: PricingModelWithProductsAndUsageMeters['products'][number]
        ) => product.active
      )
      .map(
        (
          product: PricingModelWithProductsAndUsageMeters['products'][number]
        ) => ({
          ...product,
          prices: product.prices.filter(
            (price: Price.ClientRecord) => price.active
          ),
        })
      )
      .filter(
        (
          product: PricingModelWithProductsAndUsageMeters['products'][number]
        ) => product.prices.length > 0
      )

  // Search through all products in the pricing model to find a price with the matching slug
  for (const product of filteredProducts) {
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
        eq(prices.active, true)
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

export const pricesTableRowOutputSchema = z.object({
  price: pricesClientSelectSchema,
  product: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const selectPricesTableRowData =
  createCursorPaginatedSelectFunction(
    prices,
    config,
    pricesTableRowOutputSchema,
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

      return priceRecords.map((price) => ({
        price,
        product: Price.hasProductId(price)
          ? {
              id: productsById.get(price.productId)!.id,
              name: productsById.get(price.productId)!.name,
            }
          : {
              id: '',
              name: 'Usage-Based',
            },
      }))
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
  transaction: DbTransaction
) => {
  const newDefaultPrice =
    typeof priceOrId === 'string'
      ? await selectPriceById(priceOrId, transaction)
      : priceOrId

  const { price: oldDefaultPrice } = (
    await selectPriceProductAndOrganizationByPriceWhere(
      { isDefault: true },
      transaction
    )
  )[0]

  if (oldDefaultPrice) {
    await updatePrice(
      {
        id: oldDefaultPrice.id,
        isDefault: false,
        type: oldDefaultPrice.type,
      },
      transaction
    )
  }

  const updatedPrice = await updatePrice(
    {
      id: newDefaultPrice.id,
      isDefault: true,
      type: newDefaultPrice.type,
    },
    transaction
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
  transaction: DbTransaction
) => {
  // Get productIds from non-usage prices only
  const productIds = priceInserts
    .filter((insert) => insert.productId !== null)
    .map((insert) => insert.productId as string)
  const pricingModelIdMap =
    productIds.length > 0
      ? await pricingModelIdsForProducts(productIds, transaction)
      : new Map<string, string>()
  const pricesWithPricingModelId = priceInserts.map(
    (priceInsert): Price.Insert => {
      const pricingModelId =
        priceInsert.pricingModelId ??
        (priceInsert.productId
          ? pricingModelIdMap.get(priceInsert.productId)
          : undefined)
      if (!pricingModelId) {
        throw new Error(
          `Pricing model id not found for product ${priceInsert.productId}`
        )
      }
      return {
        ...priceInsert,
        pricingModelId,
      }
    }
  )
  return bulkInsertOrDoNothingPrices(
    pricesWithPricingModelId,
    [prices.externalId, prices.productId],
    transaction
  )
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
  const result = await transaction
    .update(prices)
    .set({ isDefault: false, active: false })
    .where(eq(prices.productId, productId))
    .returning({
      id: prices.id,
      slug: prices.slug,
      active: prices.active,
      isDefault: prices.isDefault,
    })
}

const baseDangerouslyInsertPrice = createInsertFunction(
  prices,
  config
)

export const dangerouslyInsertPrice = async (
  priceInsert: Price.Insert,
  transaction: DbTransaction
): Promise<Price.Record> => {
  // Derive pricingModelId if not provided:
  // - For product prices: derive from product
  // - For usage prices: derive from usage meter
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
      `Pricing model id must be provided or derivable from productId or usageMeterId`
    )
  }
  return baseDangerouslyInsertPrice(
    {
      ...priceInsert,
      pricingModelId,
    },
    transaction
  )
}

export const safelyInsertPrice = async (
  price: Omit<Price.Insert, 'isDefault' | 'active'>,
  transaction: DbTransaction
) => {
  // For non-usage prices, reset default/active for existing product prices.
  // Usage prices (no productId) skip this step since they don't share product-level
  // default semantics - they're scoped to usage meters instead.
  if (price.productId) {
    await setPricesForProductToNonDefaultNonActive(
      price.productId,
      transaction
    )
  }
  const priceInsert: Price.Insert = pricesInsertSchema.parse({
    ...price,
    isDefault: true,
    active: true,
  })
  return dangerouslyInsertPrice(priceInsert, transaction)
}

export const safelyUpdatePrice = async (
  price: Price.Update,
  transaction: DbTransaction
) => {
  /**
   * If price is default, reset other prices for the same product
   */
  if (price.isDefault) {
    const existingPrice = await selectPriceById(price.id, transaction)
    // Only reset product prices if this is a non-usage price
    if (Price.hasProductId(existingPrice)) {
      await setPricesForProductToNonDefault(
        existingPrice.productId,
        transaction
      )
    }
  }
  return updatePrice(price, transaction)
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
