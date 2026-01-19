import { and, eq, inArray, notExists, sql } from 'drizzle-orm'
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
  type ORMMethodCreatorConfig,
  type SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import type { DbTransaction } from '@/db/types'
import { PriceType } from '@/types'
import {
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
import {
  usageMeters,
  usageMetersClientSelectSchema,
} from '../schema/usageMeters'

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
     * Optimized implementation using 3 parallel queries:
     * 1. Pricing models with usage meters
     * 2. Active products with active prices and non-expired features
     * 3. Active usage prices for usage meters
     *
     * All filtering (active products, active prices, non-expired features)
     * is done at the SQL level to minimize data transfer.
     */

    // Query 1: Get pricing models with their usage meters
    const pricingModelResults = await transaction
      .select({
        pricingModel: pricingModels,
        usageMeter: usageMeters,
      })
      .from(pricingModels)
      .leftJoin(
        usageMeters,
        eq(pricingModels.id, usageMeters.pricingModelId)
      )
      .where(whereClauseFromObject(pricingModels, where))
      .limit(100)
      .orderBy(pricingModels.createdAt)

    // Build maps for pricing models and usage meters
    const uniquePricingModelsMap = new Map<
      string,
      PricingModel.ClientRecord
    >()
    const usageMetersByPricingModelId = new Map<
      string,
      z.infer<typeof usageMetersClientSelectSchema>[]
    >()

    pricingModelResults.forEach(({ pricingModel, usageMeter }) => {
      uniquePricingModelsMap.set(
        pricingModel.id,
        pricingModelsClientSelectSchema.parse(pricingModel)
      )
      if (usageMeter) {
        const oldMeters =
          usageMetersByPricingModelId.get(pricingModel.id) ?? []
        usageMetersByPricingModelId.set(pricingModel.id, [
          ...oldMeters,
          usageMetersClientSelectSchema.parse(usageMeter),
        ])
      }
    })

    const pricingModelIds = Array.from(uniquePricingModelsMap.keys())
    if (pricingModelIds.length === 0) {
      return []
    }

    // Query 2: Get active products with active prices and non-expired features
    // This single query joins products, prices, product_features, and features
    // with all filtering done at SQL level
    const productPriceFeatureResults = await transaction
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

    // Query 3: Get active usage prices for usage meters
    const allUsageMeterIds = Array.from(
      usageMetersByPricingModelId.values()
    ).flatMap((meters) => meters.map((m) => m.id))

    const usagePricesByUsageMeterId = new Map<
      string,
      z.infer<typeof usagePriceClientSelectSchema>[]
    >()

    if (allUsageMeterIds.length > 0) {
      const usagePricesResults = await transaction
        .select()
        .from(prices)
        .where(
          and(
            inArray(prices.usageMeterId, allUsageMeterIds),
            eq(prices.type, PriceType.Usage),
            eq(prices.active, true) // Only active usage prices
          )
        )

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
    }

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
 * Gets the pricingModel for a customer. If no pricingModel explicitly associated,
 * returns the default pricingModel for the organization.
 * Note: The returned pricing model already has inactive products and prices filtered out
 * by selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere.
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
      return pricingModel
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

  return pricingModel
}
