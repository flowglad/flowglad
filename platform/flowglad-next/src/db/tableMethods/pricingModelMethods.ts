import {
  and,
  eq,
  type InferSelectModel,
  inArray,
  notExists,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import type { Customer } from '@/db/schema/customers'
import {
  features,
  featuresClientSelectSchema,
} from '@/db/schema/features'
import {
  type PricingModel,
  pricingModels,
  pricingModelsClientSelectSchema,
  pricingModelsInsertSchema,
  pricingModelsSelectSchema,
  pricingModelsUpdateSchema,
} from '@/db/schema/pricingModels'
import {
  createCursorPaginatedSelectFunction,
  createDateNotPassedFilter,
  createInsertFunction,
  createPaginatedSelectFunction,
  createSelectById,
  createSelectFunction,
  createUpdateFunction,
  NotFoundError,
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type {
  DbTransaction,
  TransactionEffectsContext,
} from '@/db/types'
import { PriceType } from '@/types'
import { CacheDependency, cached } from '@/utils/cache'
import { RedisKeyNamespace } from '@/utils/redis'
import {
  type Price,
  type PricingModelWithProductsAndUsageMeters,
  prices,
  pricesClientSelectSchema,
  usagePriceClientSelectSchema,
} from '../schema/prices'
import { productFeatures } from '../schema/productFeatures'
import {
  products,
  productsClientSelectSchema,
} from '../schema/products'
import { usageMeters } from '../schema/usageMeters'
import { selectFeaturesByPricingModelId } from './featureMethods'
import { selectPricesByPricingModelId } from './priceMethods'
import { selectProductFeaturesByPricingModelId } from './productFeatureMethods'
import { selectProductsByPricingModelId } from './productMethods'
import { selectUsageMetersByPricingModelId } from './usageMeterMethods'

const config: ORMMethodCreatorConfig<
  typeof pricingModels,
  typeof pricingModelsSelectSchema,
  typeof pricingModelsInsertSchema,
  typeof pricingModelsUpdateSchema
> = {
  selectSchema: pricingModelsSelectSchema,
  insertSchema: pricingModelsInsertSchema,
  updateSchema: pricingModelsUpdateSchema,
  tableName: 'pricingModels',
}

export const selectPricingModelById = createSelectById(
  pricingModels,
  config
)

/**
 * Select a pricing model client record by ID with caching.
 * Returns the client-safe subset of fields. Cached by default; pass { ignoreCache: true } to bypass.
 */
const selectPricingModelClientRecordById = cached(
  {
    namespace: RedisKeyNamespace.PricingModel,
    keyFn: (pricingModelId: string, _transaction: DbTransaction) =>
      pricingModelId,
    schema: pricingModelsClientSelectSchema,
    dependenciesFn: (_pricingModel, pricingModelId: string) => [
      CacheDependency.pricingModel(pricingModelId),
    ],
  },
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<PricingModel.ClientRecord> => {
    const pricingModel = await selectPricingModelById(
      pricingModelId,
      transaction
    )
    return pricingModelsClientSelectSchema.parse(pricingModel)
  }
)

const baseInsertPricingModel = createInsertFunction(
  pricingModels,
  config
)

export const insertPricingModel = async (
  pricingModel: PricingModel.Insert,
  transaction: DbTransaction
): Promise<PricingModel.Record> => {
  const result = await baseInsertPricingModel(
    pricingModel,
    transaction
  )
  // Note: No cache invalidation needed for insert since there's no existing cache entry
  return result
}

const baseUpdatePricingModel = createUpdateFunction(
  pricingModels,
  config
)

export const updatePricingModel = async (
  pricingModel: PricingModel.Update,
  ctx: TransactionEffectsContext
): Promise<PricingModel.Record> => {
  const result = await baseUpdatePricingModel(
    pricingModel,
    ctx.transaction
  )
  // Invalidate cache for the updated pricing model (queued for after commit)
  ctx.invalidateCache(CacheDependency.pricingModel(result.id))
  return result
}

export const selectPricingModels = createSelectFunction(
  pricingModels,
  config
)

export const selectPricingModelsPaginated =
  createPaginatedSelectFunction(pricingModels, config)

export const selectDefaultPricingModel = async (
  {
    organizationId,
    livemode,
  }: { organizationId: string; livemode: boolean },
  transaction: DbTransaction
): Promise<PricingModel.Record | null> => {
  const [pricingModel] = await selectPricingModels(
    { organizationId, livemode, isDefault: true },
    transaction
  )
  if (!pricingModel) {
    return null
  }
  return pricingModel
}

/**
 * Checks if an organization already has a livemode pricing model.
 * Used to enforce the constraint that each organization can have at most
 * one livemode pricing model.
 *
 * Uses EXISTS for efficiency since we only need to check existence, not count.
 *
 * @param organizationId - The organization to check
 * @param transaction - Database transaction
 * @returns true if a livemode pricing model exists, false otherwise
 */
export const hasLivemodePricingModel = async (
  organizationId: string,
  transaction: DbTransaction
): Promise<boolean> => {
  const result = await transaction
    .select({
      exists: sql<boolean>`EXISTS (
        SELECT 1 FROM ${pricingModels}
        WHERE ${pricingModels.organizationId} = ${organizationId}
        AND ${pricingModels.livemode} = true
      )`.mapWith(Boolean),
    })
    .from(sql`(SELECT 1) AS dummy`)
  return result[0]?.exists ?? false
}

export const makePricingModelDefault = async (
  newDefaultPricingModelOrId: PricingModel.Record | string,
  ctx: TransactionEffectsContext
) => {
  const newDefaultPricingModel =
    typeof newDefaultPricingModelOrId === 'string'
      ? await selectPricingModelById(
          newDefaultPricingModelOrId,
          ctx.transaction
        )
      : newDefaultPricingModelOrId
  const oldDefaultPricingModel = await selectDefaultPricingModel(
    {
      organizationId: newDefaultPricingModel.organizationId,
      livemode: newDefaultPricingModel.livemode,
    },
    ctx.transaction
  )
  if (oldDefaultPricingModel) {
    await updatePricingModel(
      { id: oldDefaultPricingModel.id, isDefault: false },
      ctx
    )
    // Note: updatePricingModel already handles cache invalidation
  }
  const updatedPricingModel = await updatePricingModel(
    { id: newDefaultPricingModel.id, isDefault: true },
    ctx
  )
  // Note: updatePricingModel already handles cache invalidation
  return updatedPricingModel
}

const setPricingModelsForOrganizationToNonDefault = async (
  {
    organizationId,
    livemode,
  }: { organizationId: string; livemode: boolean },
  ctx: TransactionEffectsContext
) => {
  // Perform the bulk update and get affected IDs
  const updatedPricingModels = await ctx.transaction
    .update(pricingModels)
    .set({ isDefault: false })
    .where(
      and(
        eq(pricingModels.organizationId, organizationId),
        eq(pricingModels.livemode, livemode)
      )
    )
    .returning({ id: pricingModels.id })

  // Invalidate cache for all affected pricing models (queued for after commit)
  for (const pm of updatedPricingModels) {
    ctx.invalidateCache(CacheDependency.pricingModel(pm.id))
  }

  return true
}

export const safelyUpdatePricingModel = async (
  pricingModel: PricingModel.Update,
  ctx: TransactionEffectsContext
) => {
  /**
   * If price is default
   */
  if (pricingModel.isDefault) {
    const existingPricingModel = await selectPricingModelById(
      pricingModel.id,
      ctx.transaction
    )
    await setPricingModelsForOrganizationToNonDefault(
      {
        organizationId: existingPricingModel.organizationId,
        livemode: existingPricingModel.livemode,
      },
      ctx
    )
  }
  return updatePricingModel(pricingModel, ctx)
}

export const safelyInsertPricingModel = async (
  pricingModel: PricingModel.Insert,
  ctx: TransactionEffectsContext
) => {
  // Check if org already has a livemode pricing model
  if (pricingModel.livemode) {
    const exists = await hasLivemodePricingModel(
      pricingModel.organizationId,
      ctx.transaction
    )
    if (exists) {
      throw new Error(
        'Organization already has a livemode pricing model. Only one livemode pricing model is allowed per organization.'
      )
    }
  }

  if (pricingModel.isDefault) {
    await setPricingModelsForOrganizationToNonDefault(
      {
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
      },
      ctx
    )
  }
  return insertPricingModel(pricingModel, ctx.transaction)
}

const pricingModelTableRowSchema = z.object({
  pricingModel: pricingModelsClientSelectSchema,
  productsCount: z.number(),
})

/**
 * Counts non-usage products by pricing model IDs.
 * A "usage-product" is defined as a product with any price where type = 'usage'.
 *
 * @param pricingModelIds - Array of pricing model IDs to count products for
 * @param transaction - Database transaction
 * @returns Map of pricingModelId -> count of non-usage products
 */
export const countNonUsageProductsByPricingModelIds = async (
  pricingModelIds: string[],
  transaction: DbTransaction
): Promise<Map<string, number>> => {
  if (pricingModelIds.length === 0) {
    return new Map()
  }

  // Query: SELECT pricing_model_id, COUNT(*) as count
  // FROM products p
  // WHERE p.pricing_model_id IN (...)
  //   AND NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id AND pr.type = 'usage')
  // GROUP BY p.pricing_model_id
  const results = await transaction
    .select({
      pricingModelId: products.pricingModelId,
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(products)
    .where(
      and(
        inArray(products.pricingModelId, pricingModelIds),
        notExists(
          sql`(SELECT 1 FROM ${prices} WHERE ${prices.productId} = ${products.id} AND ${prices.type} = ${PriceType.Usage})`
        )
      )
    )
    .groupBy(products.pricingModelId)

  const countMap = new Map<string, number>()
  for (const row of results) {
    countMap.set(row.pricingModelId, row.count)
  }
  return countMap
}

export const selectPricingModelsTableRows =
  createCursorPaginatedSelectFunction(
    pricingModels,
    config,
    pricingModelTableRowSchema,
    async (pricingModelsResult, transaction) => {
      const productsByPricingModelId =
        await countNonUsageProductsByPricingModelIds(
          pricingModelsResult.map((pricingModel) => pricingModel.id),
          transaction
        )

      return pricingModelsResult.map((pricingModel) => ({
        pricingModel: pricingModel,
        productsCount:
          productsByPricingModelId.get(pricingModel.id) || 0,
      }))
    },
    // Searchable columns for ILIKE search on name
    [pricingModels.name]
  )

export const selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere =
  async (
    where: SelectConditions<typeof pricingModels>,
    transaction: DbTransaction
  ): Promise<PricingModelWithProductsAndUsageMeters[]> => {
    /**
     * Optimized implementation using 3 queries + cached usage meter fetch:
     * 1. Pricing models (sequential - provides IDs for subsequent queries)
     * 2. Usage meters via cached selectUsageMetersByPricingModelId (parallel with 3, 4)
     * 3. Active products with active prices and non-expired features (parallel with 2, 4)
     * 4. Active usage prices for usage meters (parallel with 2, 3)
     *
     * All filtering (active products, active prices, non-expired features)
     * is done at the SQL level to minimize data transfer.
     * Usage meters are fetched via cached query for per-pricing-model caching benefit.
     */

    // Query 1: Get pricing models
    const pricingModelResults = await transaction
      .select()
      .from(pricingModels)
      .where(whereClauseFromObject(pricingModels, where))
      .limit(100)
      .orderBy(pricingModels.createdAt)

    if (pricingModelResults.length === 0) {
      return []
    }

    // Build map for pricing models
    const uniquePricingModelsMap = new Map<
      string,
      PricingModel.ClientRecord
    >()
    pricingModelResults.forEach((pricingModel) => {
      uniquePricingModelsMap.set(
        pricingModel.id,
        pricingModelsClientSelectSchema.parse(pricingModel)
      )
    })

    const pricingModelIds = Array.from(uniquePricingModelsMap.keys())

    // Fetch usage meters for each pricing model using cached query
    // This runs in parallel with the products/prices queries
    const usageMetersByPricingModelId = new Map<
      string,
      Awaited<ReturnType<typeof selectUsageMetersByPricingModelId>>
    >()

    // Run usage meter fetches, product query, and prepare for usage prices query in parallel
    const usageMeterPromises = pricingModelIds.map(
      async (pricingModelId) => {
        const meters = await selectUsageMetersByPricingModelId(
          pricingModelId,
          transaction
        )
        return { pricingModelId, meters }
      }
    )

    // Query 2: Get active products with active prices and non-expired features
    // Uses INNER JOIN on prices to ensure only products with at least one active price
    // are returned (products with only inactive prices are excluded)
    const productPriceFeaturePromise = transaction
      .select({
        product: products,
        price: prices,
        feature: features,
      })
      .from(products)
      .innerJoin(
        prices,
        and(
          eq(prices.productId, products.id),
          eq(prices.active, true) // Only active prices
        )
      )
      .leftJoin(
        productFeatures,
        and(
          eq(productFeatures.productId, products.id),
          createDateNotPassedFilter(productFeatures.expiredAt) // Only non-expired features
        )
      )
      .leftJoin(features, eq(features.id, productFeatures.featureId))
      .where(
        and(
          inArray(products.pricingModelId, pricingModelIds),
          eq(products.active, true) // Only active products
        )
      )

    // Wait for usage meters first so we can get their IDs for the usage prices query
    const usageMeterResults = await Promise.all(usageMeterPromises)
    usageMeterResults.forEach(({ pricingModelId, meters }) => {
      usageMetersByPricingModelId.set(pricingModelId, meters)
    })

    // Get all usage meter IDs for query 3
    const allUsageMeterIds = Array.from(
      usageMetersByPricingModelId.values()
    ).flatMap((meters) => meters.map((m) => m.id))

    // Run product query and usage prices query in parallel
    const [productPriceFeatureResults, usagePricesResults] =
      await Promise.all([
        productPriceFeaturePromise,

        // Query 3: Get active usage prices for usage meters
        allUsageMeterIds.length > 0
          ? transaction
              .select()
              .from(prices)
              .where(
                and(
                  inArray(prices.usageMeterId, allUsageMeterIds),
                  eq(prices.type, PriceType.Usage),
                  eq(prices.active, true) // Only active usage prices
                )
              )
          : Promise.resolve([]),
      ])

    // Aggregate products with their prices and features
    const productMap = new Map<
      string,
      {
        product: z.infer<typeof productsClientSelectSchema>
        prices: z.infer<typeof pricesClientSelectSchema>[]
        features: z.infer<typeof featuresClientSelectSchema>[]
      }
    >()

    productPriceFeatureResults.forEach(
      ({ product, price, feature }) => {
        const existing = productMap.get(product.id)
        if (!existing) {
          productMap.set(product.id, {
            product: productsClientSelectSchema.parse(product),
            prices: [pricesClientSelectSchema.parse(price)],
            features: feature
              ? [featuresClientSelectSchema.parse(feature)]
              : [],
          })
        } else {
          // Add price if not already present
          if (!existing.prices.some((p) => p.id === price.id)) {
            existing.prices.push(
              pricesClientSelectSchema.parse(price)
            )
          }
          // Add feature if not already present and not null
          if (
            feature &&
            !existing.features.some((f) => f.id === feature.id)
          ) {
            existing.features.push(
              featuresClientSelectSchema.parse(feature)
            )
          }
        }
      }
    )

    // Group products by pricing model
    const productsByPricingModelId = new Map<
      string,
      PricingModelWithProductsAndUsageMeters['products']
    >()

    productMap.forEach(
      ({ product, prices: productPrices, features }) => {
        // defaultPrice is guaranteed to exist because the INNER JOIN ensures
        // at least one active price per product
        const defaultPrice =
          productPrices.find((p) => p.isDefault) ?? productPrices[0]

        const productWithPrices = {
          ...product,
          prices: productPrices,
          features,
          defaultPrice,
        }

        const existing =
          productsByPricingModelId.get(product.pricingModelId) ?? []
        productsByPricingModelId.set(product.pricingModelId, [
          ...existing,
          productWithPrices,
        ])
      }
    )

    // Process usage prices results
    const usagePricesByUsageMeterId = new Map<
      string,
      z.infer<typeof usagePriceClientSelectSchema>[]
    >()

    usagePricesResults.forEach((price) => {
      if (!price.usageMeterId) return
      const parsedPrice = usagePriceClientSelectSchema.parse(price)
      const existing =
        usagePricesByUsageMeterId.get(price.usageMeterId) ?? []
      usagePricesByUsageMeterId.set(price.usageMeterId, [
        ...existing,
        parsedPrice,
      ])
    })

    // Build final result
    return Array.from(uniquePricingModelsMap.values()).map(
      (pricingModel) => {
        // Build usage meters with their prices
        const usageMetersForPricingModel =
          usageMetersByPricingModelId.get(pricingModel.id) ?? []
        const usageMetersWithPrices = usageMetersForPricingModel.map(
          (usageMeter) => {
            const meterPrices =
              usagePricesByUsageMeterId.get(usageMeter.id) ?? []
            const defaultPrice =
              meterPrices.find((p) => p.isDefault) ?? meterPrices[0]
            return {
              ...usageMeter,
              prices: meterPrices,
              defaultPrice,
            }
          }
        )

        const productsForPricingModel =
          productsByPricingModelId.get(pricingModel.id) ?? []

        return {
          ...pricingModel,
          usageMeters: usageMetersWithPrices,
          products: productsForPricingModel,
          defaultProduct:
            productsForPricingModel.find((p) => p.default) ??
            undefined,
        }
      }
    )
  }

/**
 * Type guard to narrow Price.ClientRecord to Price.ClientUsageRecord.
 */
const isClientUsagePrice = (
  price: Price.ClientRecord
): price is Price.ClientUsageRecord => {
  return price.type === PriceType.Usage
}

/**
 * Assembles a PricingModelWithProductsAndUsageMeters from cached atomic queries.
 * Each atom is cached independently with its own invalidation trigger.
 *
 * @param pricingModelId - The ID of the pricing model to fetch
 * @param transaction - Database transaction
 * @returns The fully assembled pricing model with products, prices, features, and usage meters
 */
export const selectPricingModelWithProductsAndUsageMetersById =
  async (
    pricingModelId: string,
    transaction: DbTransaction
  ): Promise<PricingModelWithProductsAndUsageMeters> => {
    // Fetch all atoms in parallel (each is independently cached)
    const [
      pricingModel,
      productsResult,
      pricesResult,
      featuresResult,
      productFeaturesResult,
      usageMetersResult,
    ] = await Promise.all([
      selectPricingModelClientRecordById(pricingModelId, transaction),
      selectProductsByPricingModelId(pricingModelId, transaction),
      selectPricesByPricingModelId(pricingModelId, transaction),
      selectFeaturesByPricingModelId(pricingModelId, transaction),
      selectProductFeaturesByPricingModelId(
        pricingModelId,
        transaction
      ),
      selectUsageMetersByPricingModelId(pricingModelId, transaction),
    ])

    // Filter to only active prices (matching SQL path behavior)
    const activePrices = pricesResult.filter((price) => price.active)

    // Build prices by productId map (only for active prices with productId)
    const pricesByProductId = new Map<
      string,
      (typeof pricesResult)[number][]
    >()
    // Build prices by usageMeterId map (for active usage prices)
    const pricesByUsageMeterId = new Map<
      string,
      Price.ClientUsageRecord[]
    >()
    for (const price of activePrices) {
      if (price.productId) {
        const existing = pricesByProductId.get(price.productId) ?? []
        pricesByProductId.set(price.productId, [...existing, price])
      } else if (price.usageMeterId && isClientUsagePrice(price)) {
        const existing =
          pricesByUsageMeterId.get(price.usageMeterId) ?? []
        pricesByUsageMeterId.set(price.usageMeterId, [
          ...existing,
          price,
        ])
      }
    }

    // Build features by productId map using product features as join table
    const featuresById = new Map(featuresResult.map((f) => [f.id, f]))
    const featuresByProductId = new Map<
      string,
      (typeof featuresResult)[number][]
    >()
    for (const pf of productFeaturesResult) {
      // Only include non-expired product features
      if (pf.expiredAt !== null) continue
      const feature = featuresById.get(pf.featureId)
      if (feature) {
        const existing = featuresByProductId.get(pf.productId) ?? []
        featuresByProductId.set(pf.productId, [...existing, feature])
      }
    }

    // Filter to only active products (matching SQL path behavior)
    // Also filter out products with no active prices (matching INNER JOIN behavior in SQL path)
    const activeProducts = productsResult.filter(
      (product) => product.active && pricesByProductId.has(product.id)
    )

    // Build products with prices, features, and defaultPrice
    const productsWithPrices: PricingModelWithProductsAndUsageMeters['products'] =
      activeProducts.map((product) => {
        const productPrices = pricesByProductId.get(product.id) ?? []
        const productFeatures =
          featuresByProductId.get(product.id) ?? []
        const defaultPrice =
          productPrices.find((p) => p.isDefault) ?? productPrices[0]

        return {
          ...product,
          prices: productPrices,
          features: productFeatures,
          defaultPrice,
        }
      })

    // Find default product
    const defaultProduct =
      productsWithPrices.find((p) => p.default) ?? undefined

    // Build usage meters with prices
    const usageMetersWithPrices: PricingModelWithProductsAndUsageMeters['usageMeters'] =
      usageMetersResult.map((meter) => {
        const meterPrices = pricesByUsageMeterId.get(meter.id) ?? []
        const defaultPrice =
          meterPrices.find((p) => p.isDefault) ?? meterPrices[0]

        return {
          ...meter,
          prices: meterPrices,
          defaultPrice,
        }
      })

    return {
      ...pricingModel,
      products: productsWithPrices,
      usageMeters: usageMetersWithPrices,
      defaultProduct,
    }
  }

/**
 * Gets the pricingModel for a customer. If no pricingModel explicitly associated,
 * returns the default pricingModel for the organization.
 * Note: Uses the cached atomic assembly function selectPricingModelWithProductsAndUsageMetersById
 * which has inactive products and prices filtered out.
 * @param customer
 * @param transaction
 * @returns
 */
export const selectPricingModelForCustomer = async (
  customer: Customer.Record,
  transaction: DbTransaction
): Promise<PricingModelWithProductsAndUsageMeters> => {
  if (customer.pricingModelId) {
    try {
      return await selectPricingModelWithProductsAndUsageMetersById(
        customer.pricingModelId,
        transaction
      )
    } catch (error) {
      // If the specific pricing model isn't found, fall back to default
      if (!(error instanceof NotFoundError)) {
        throw error
      }
    }
  }

  const defaultPricingModel = await selectDefaultPricingModel(
    {
      organizationId: customer.organizationId,
      livemode: customer.livemode,
    },
    transaction
  )

  if (!defaultPricingModel) {
    throw new Error(
      `No default pricing model found for organization ${customer.organizationId}`
    )
  }

  return selectPricingModelWithProductsAndUsageMetersById(
    defaultPricingModel.id,
    transaction
  )
}

/**
 * Minimal price data needed for slug resolution in bulk usage event processing.
 * Only contains fields required to map price slugs to IDs.
 *
 * Note: type uses the inferred type from drizzle-orm's InferSelectModel
 *
 */
export type PriceSlugInfo = {
  id: string
  slug: string | null
  type: InferSelectModel<typeof prices>['type']
  usageMeterId: string | null
  active: boolean
}

/**
 * Minimal usage meter data needed for slug resolution and validation.
 * Only contains fields required to map usage meter slugs to IDs.
 */
export type UsageMeterSlugInfo = {
  id: string
  slug: string
}

/**
 * Contains only the price and usage meter fields needed for:
 * 1. Resolving price slugs to IDs
 * 2. Resolving usage meter slugs to IDs
 * 3. Validating usage meter membership in pricing model
 */
export type PricingModelSlugResolutionData = {
  id: string
  organizationId: string
  livemode: boolean
  isDefault: boolean
  prices: PriceSlugInfo[]
  usageMeters: UsageMeterSlugInfo[]
}

/**
 * Performance-optimized query to fetch minimal pricing model data for slug resolution.
 * Only selects fields needed for:
 * - Price slug → ID resolution
 * - Usage meter slug → ID resolution
 * - Pricing model membership validation
 *
 * @param where - Pricing model filter conditions
 * @param transaction - Database transaction
 * @returns Array of lightweight pricing model data
 */
export const selectPricingModelSlugResolutionData = async (
  where: SelectConditions<typeof pricingModels>,
  transaction: DbTransaction
): Promise<PricingModelSlugResolutionData[]> => {
  // Query 1: Fetch pricing models with usage meters (minimal fields)
  const pricingModelResults = await transaction
    .select({
      pricingModelId: pricingModels.id,
      pricingModelOrganizationId: pricingModels.organizationId,
      pricingModelLivemode: pricingModels.livemode,
      pricingModelIsDefault: pricingModels.isDefault,
      usageMeterId: usageMeters.id,
      usageMeterSlug: usageMeters.slug,
    })
    .from(pricingModels)
    .leftJoin(
      usageMeters,
      eq(pricingModels.id, usageMeters.pricingModelId)
    )
    .where(whereClauseFromObject(pricingModels, where))
    .orderBy(pricingModels.createdAt)

  // Build maps for pricing models and their usage meters
  // Use a Set to track seen usage meter IDs for de-duplication (LEFT JOIN can produce duplicates)
  const pricingModelMap = new Map<
    string,
    {
      id: string
      organizationId: string
      livemode: boolean
      isDefault: boolean
      usageMeters: UsageMeterSlugInfo[]
      seenUsageMeterIds: Set<string> // Track seen IDs to de-dupe
    }
  >()

  pricingModelResults.forEach((row) => {
    if (!pricingModelMap.has(row.pricingModelId)) {
      pricingModelMap.set(row.pricingModelId, {
        id: row.pricingModelId,
        organizationId: row.pricingModelOrganizationId,
        livemode: row.pricingModelLivemode,
        isDefault: row.pricingModelIsDefault,
        usageMeters: [],
        seenUsageMeterIds: new Set(),
      })
    }

    const pm = pricingModelMap.get(row.pricingModelId)!

    // Only add usage meter if:
    // 1. usageMeterId is not null (from LEFT JOIN)
    // 2. usageMeterSlug is not null and not whitespace-only
    // 3. We haven't already seen this usage meter ID (de-dupe)
    const trimmedSlug = row.usageMeterSlug?.trim() ?? ''
    if (
      trimmedSlug.length > 0 &&
      row.usageMeterId &&
      !pm.seenUsageMeterIds.has(row.usageMeterId)
    ) {
      pm.seenUsageMeterIds.add(row.usageMeterId)
      pm.usageMeters.push({
        id: row.usageMeterId,
        slug: trimmedSlug,
      })
    }
  })

  const pricingModelIds = Array.from(pricingModelMap.keys())
  if (pricingModelIds.length === 0) {
    return []
  }

  // Query 2a: Fetch product-linked prices with minimal fields
  // Only fetch prices where the product is active
  const priceResults = await transaction
    .select({
      priceId: prices.id,
      priceSlug: prices.slug,
      priceType: prices.type,
      priceUsageMeterId: prices.usageMeterId,
      priceActive: prices.active,
      productPricingModelId: products.pricingModelId,
      productActive: products.active,
    })
    .from(prices)
    .innerJoin(products, eq(prices.productId, products.id))
    .where(
      and(
        inArray(products.pricingModelId, pricingModelIds),
        eq(products.active, true), // Only active products
        eq(prices.active, true) // Only active prices
      )
    )

  // Query 2b: Fetch usage meter-linked prices (productId is NULL)
  // These are prices directly attached to usage meters
  const usageMeterPriceResults = await transaction
    .select({
      priceId: prices.id,
      priceSlug: prices.slug,
      priceType: prices.type,
      priceUsageMeterId: prices.usageMeterId,
      priceActive: prices.active,
      productPricingModelId: usageMeters.pricingModelId,
      productActive: sql<boolean>`true`.as('productActive'), // No product to check, always true
    })
    .from(prices)
    .innerJoin(usageMeters, eq(prices.usageMeterId, usageMeters.id))
    .where(
      and(
        inArray(usageMeters.pricingModelId, pricingModelIds),
        eq(prices.active, true) // Only active prices
      )
    )

  // Merge both product and usage meter prices
  const combinedPrices = priceResults.concat(usageMeterPriceResults)

  // Group prices by pricing model
  // De-duplicate by price ID in case of any edge cases
  const pricesByPricingModelId = new Map<string, PriceSlugInfo[]>()
  const seenPriceIds = new Set<string>()

  combinedPrices.forEach((row) => {
    // Skip if already seen (de-dupe)
    if (seenPriceIds.has(row.priceId)) {
      return
    }
    seenPriceIds.add(row.priceId)

    if (!pricesByPricingModelId.has(row.productPricingModelId)) {
      pricesByPricingModelId.set(row.productPricingModelId, [])
    }
    pricesByPricingModelId.get(row.productPricingModelId)!.push({
      id: row.priceId,
      slug: row.priceSlug,
      type: row.priceType,
      usageMeterId: row.priceUsageMeterId,
      active: row.priceActive,
    })
  })

  // Combine into final result (strip out the seenUsageMeterIds tracking field)
  return Array.from(pricingModelMap.values()).map((pm) => ({
    id: pm.id,
    organizationId: pm.organizationId,
    livemode: pm.livemode,
    isDefault: pm.isDefault,
    usageMeters: pm.usageMeters,
    prices: pricesByPricingModelId.get(pm.id) ?? [],
  }))
}
