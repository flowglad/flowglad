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
  type PricingModel,
  pricingModels,
  pricingModelsClientSelectSchema,
  pricingModelsInsertSchema,
  pricingModelsSelectSchema,
  pricingModelsUpdateSchema,
} from '@/db/schema/pricingModels'
import {
  createCursorPaginatedSelectFunction,
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
import { type Feature } from '../schema/features'
import {
  type Price,
  type PricingModelWithProductsAndUsageMeters,
  prices,
  usagePriceClientSelectSchema,
} from '../schema/prices'
import { type ProductFeature } from '../schema/productFeatures'
import { products } from '../schema/products'
import { type UsageMeter, usageMeters } from '../schema/usageMeters'
import {
  selectPrices,
  selectPricesAndProductsByProductWhere,
} from './priceMethods'
import { selectFeaturesByProductFeatureWhere } from './productFeatureMethods'
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

export const insertPricingModel = createInsertFunction(
  pricingModels,
  config
)

export const updatePricingModel = createUpdateFunction(
  pricingModels,
  config
)

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

export const makePricingModelDefault = async (
  newDefaultPricingModelOrId: PricingModel.Record | string,
  transaction: DbTransaction
) => {
  const newDefaultPricingModel =
    typeof newDefaultPricingModelOrId === 'string'
      ? await selectPricingModelById(
          newDefaultPricingModelOrId,
          transaction
        )
      : newDefaultPricingModelOrId
  const oldDefaultPricingModel = await selectDefaultPricingModel(
    {
      organizationId: newDefaultPricingModel.organizationId,
      livemode: newDefaultPricingModel.livemode,
    },
    transaction
  )
  if (oldDefaultPricingModel) {
    await updatePricingModel(
      { id: oldDefaultPricingModel.id, isDefault: false },
      transaction
    )
  }
  const updatedPricingModel = await updatePricingModel(
    { id: newDefaultPricingModel.id, isDefault: true },
    transaction
  )
  return updatedPricingModel
}

const setPricingModelsForOrganizationToNonDefault = async (
  {
    organizationId,
    livemode,
  }: { organizationId: string; livemode: boolean },
  transaction: DbTransaction
) => {
  await transaction
    .update(pricingModels)
    .set({ isDefault: false })
    .where(
      and(
        eq(pricingModels.organizationId, organizationId),
        eq(pricingModels.livemode, livemode)
      )
    )
  return true
}

export const safelyUpdatePricingModel = async (
  pricingModel: PricingModel.Update,
  transaction: DbTransaction
) => {
  /**
   * If price is default
   */
  if (pricingModel.isDefault) {
    const existingPricingModel = await selectPricingModelById(
      pricingModel.id,
      transaction
    )
    await setPricingModelsForOrganizationToNonDefault(
      {
        organizationId: existingPricingModel.organizationId,
        livemode: existingPricingModel.livemode,
      },
      transaction
    )
  }
  return updatePricingModel(pricingModel, transaction)
}

export const safelyInsertPricingModel = async (
  pricingModel: PricingModel.Insert,
  transaction: DbTransaction
) => {
  if (pricingModel.isDefault) {
    await setPricingModelsForOrganizationToNonDefault(
      {
        organizationId: pricingModel.organizationId,
        livemode: pricingModel.livemode,
      },
      transaction
    )
  }
  return insertPricingModel(pricingModel, transaction)
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
     * Why two queries instead of a JOIN?
     *
     * A single JOIN query with LIMIT 100 would limit the *joined rows*, not
     * the pricing models. For example, if one pricing model has 50 products,
     * that's 50 rows — so LIMIT 100 might only return 2 pricing models.
     *
     * By splitting into two queries:
     * 1. Fetch pricing models with LIMIT 100 → guarantees up to 100 pricing models
     * 2. Fetch all products for those pricing model IDs → no limit needed
     *
     * Trade-off: If a pricing model has thousands of products, the second query
     * could be slow. In practice, this is acceptable since pricing models typically
     * have a reasonable number of products.
     *
     * Usage meters are fetched via a cached query (selectUsageMetersByPricingModelId)
     * rather than a JOIN, enabling per-pricing-model caching of usage meter config data.
     */
    const pricingModelResults = await transaction
      .select()
      .from(pricingModels)
      .where(whereClauseFromObject(pricingModels, where))
      .limit(100)
      .orderBy(pricingModels.createdAt)

    if (pricingModelResults.length === 0) {
      return []
    }

    // All pricing models in this query have the same livemode due to RLS filtering
    const livemode = pricingModelResults[0].livemode

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

    // Fetch usage meters for each pricing model using cached query
    const usageMetersByPricingModelId = new Map<
      string,
      UsageMeter.ClientRecord[]
    >()
    await Promise.all(
      Array.from(uniquePricingModelsMap.keys()).map(
        async (pricingModelId) => {
          const meters = await selectUsageMetersByPricingModelId(
            pricingModelId,
            transaction,
            livemode
          )
          usageMetersByPricingModelId.set(pricingModelId, meters)
        }
      )
    )

    const productResults =
      await selectPricesAndProductsByProductWhere(
        { pricingModelId: Array.from(uniquePricingModelsMap.keys()) },
        transaction
      )
    const productFeaturesAndFeatures =
      await selectFeaturesByProductFeatureWhere(
        { productId: productResults.map((product) => product.id) },
        transaction
      )

    // Fetch usage prices for usage meters (usage prices have productId = null)
    // Get all usage meter IDs across all pricing models
    const allUsageMeterIds = Array.from(
      usageMetersByPricingModelId.values()
    ).flatMap((meters) => meters.map((m) => m.id))
    const usagePricesResults =
      allUsageMeterIds.length > 0
        ? await selectPrices(
            { usageMeterId: allUsageMeterIds, type: PriceType.Usage },
            transaction
          )
        : []

    // Group usage prices by usage meter ID
    const usagePricesByUsageMeterId = new Map<
      string,
      Price.ClientUsageRecord[]
    >()
    usagePricesResults.forEach((price) => {
      if (price.type !== PriceType.Usage || !price.usageMeterId) {
        return
      }
      const parsedPrice = usagePriceClientSelectSchema.parse(price)
      const existing =
        usagePricesByUsageMeterId.get(price.usageMeterId) ?? []
      usagePricesByUsageMeterId.set(price.usageMeterId, [
        ...existing,
        parsedPrice,
      ])
    })

    const productFeaturesAndFeaturesByProductId = new Map<
      string,
      {
        productFeature: ProductFeature.Record
        feature: Feature.Record
      }[]
    >()
    productFeaturesAndFeatures.forEach(
      ({ productFeature, feature }) => {
        productFeaturesAndFeaturesByProductId.set(
          productFeature.productId,
          [
            ...(productFeaturesAndFeaturesByProductId.get(
              productFeature.productId
            ) || []),
            {
              productFeature,
              feature,
            },
          ]
        )
      }
    )
    const productsByPricingModelId = new Map<
      string,
      PricingModelWithProductsAndUsageMeters['products']
    >()

    productResults.forEach(({ prices, ...product }) => {
      productsByPricingModelId.set(product.pricingModelId, [
        ...(productsByPricingModelId.get(product.pricingModelId) ||
          []),
        {
          ...product,
          prices,
          features:
            productFeaturesAndFeaturesByProductId
              .get(product.id)
              ?.map((p) => p.feature) ?? [],
          defaultPrice:
            prices.find((price) => price.isDefault) ?? prices[0],
        },
      ])
    })

    const uniquePricingModels = Array.from(
      uniquePricingModelsMap.values()
    )
    return uniquePricingModels.map((pricingModel) => {
      // Get usage meters with their prices
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

      return {
        ...pricingModel,
        usageMeters: usageMetersWithPrices,
        products: productsByPricingModelId.get(pricingModel.id) ?? [],
        defaultProduct:
          productsByPricingModelId
            .get(pricingModel.id)
            ?.find((product) => product.default) ?? undefined,
      }
    })
  }

/**
 * Filters a pricing model to only include active products, prices, and usage meters.
 * Products without active prices are removed.
 * Usage meters keep their prices but filter to only active ones.
 */
const filterActivePricingModelContent = (
  pricingModel: PricingModelWithProductsAndUsageMeters
): PricingModelWithProductsAndUsageMeters => {
  return {
    ...pricingModel,
    products: pricingModel.products
      .filter((product) => product.active)
      .map((product) => ({
        ...product,
        prices: product.prices.filter((price) => price.active),
      }))
      .filter((product) => product.prices.length > 0), // Filter out products with no active prices
    usageMeters: pricingModel.usageMeters.map((usageMeter) => {
      const activePrices = usageMeter.prices.filter(
        (price) => price.active
      )
      const defaultPrice =
        activePrices.find((p) => p.isDefault) ?? activePrices[0]
      return {
        ...usageMeter,
        prices: activePrices,
        defaultPrice,
      }
    }),
  }
}

/**
 * Gets the pricingModel for a customer. If no pricingModel explicitly associated,
 * returns the default pricingModel for the organization.
 * @param customer
 * @param transaction
 * @returns
 */
export const selectPricingModelForCustomer = async (
  customer: Customer.Record,
  transaction: DbTransaction
): Promise<PricingModelWithProductsAndUsageMeters> => {
  if (customer.pricingModelId) {
    const [pricingModel] =
      await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: customer.pricingModelId },
        transaction
      )

    if (pricingModel) {
      return filterActivePricingModelContent(pricingModel)
    }
  }
  const [pricingModel] =
    await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
      {
        isDefault: true,
        organizationId: customer.organizationId,
        livemode: customer.livemode,
      },
      transaction
    )

  if (!pricingModel) {
    throw new Error(
      `No default pricing model found for organization ${customer.organizationId}`
    )
  }

  return filterActivePricingModelContent(pricingModel)
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
