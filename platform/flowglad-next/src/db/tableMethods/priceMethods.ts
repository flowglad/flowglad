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
  type Price,
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
  const pricingModelIdMap = await pricingModelIdsForProducts(
    priceInserts.map((insert) => insert.productId),
    transaction
  )
  const pricesWithPricingModelId = priceInserts.map(
    (priceInsert): Price.Insert => {
      const pricingModelId =
        priceInsert.pricingModelId ??
        pricingModelIdMap.get(priceInsert.productId)
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
  return baseBulkInsertPrices(pricesWithPricingModelId, transaction)
}

export const selectPrices = createSelectFunction(prices, config)

const baseInsertPrice = createInsertFunction(prices, config)

export const insertPrice = async (
  priceInsert: Price.Insert,
  transaction: DbTransaction
): Promise<Price.Record> => {
  const pricingModelId = priceInsert.pricingModelId
    ? priceInsert.pricingModelId
    : await derivePricingModelIdFromProduct(
        priceInsert.productId,
        transaction
      )
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
    async (prices: Price.Record[], transaction: DbTransaction) => {
      const productIds = prices.map((price) => price.productId)
      const products = await selectProducts(
        { id: productIds },
        transaction
      )
      const productsById = new Map(
        products.map((product: Product.Record) => [
          product.id,
          product,
        ])
      )

      return prices.map((price) => ({
        price,
        product: {
          id: productsById.get(price.productId)!.id,
          name: productsById.get(price.productId)!.name,
        },
      }))
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
  const pricingModelIdMap = await pricingModelIdsForProducts(
    priceInserts.map((insert) => insert.productId),
    transaction
  )
  const pricesWithPricingModelId = priceInserts.map(
    (priceInsert): Price.Insert => {
      const pricingModelId =
        priceInsert.pricingModelId ??
        pricingModelIdMap.get(priceInsert.productId)
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
  const pricingModelId = priceInsert.pricingModelId
    ? priceInsert.pricingModelId
    : await derivePricingModelIdFromProduct(
        priceInsert.productId,
        transaction
      )
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
  // for now, only allow one active and default price per product
  await setPricesForProductToNonDefaultNonActive(
    price.productId,
    transaction
  )
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
   * If price is default
   */
  if (price.isDefault) {
    const existingPrice = await selectPriceById(price.id, transaction)
    await setPricesForProductToNonDefault(
      existingPrice.productId,
      transaction
    )
  }
  return updatePrice(price, transaction)
}
