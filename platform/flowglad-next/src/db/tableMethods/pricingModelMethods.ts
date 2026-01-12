import { and, eq, inArray } from 'drizzle-orm'
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
import {
  type Feature,
  features,
  featuresSelectSchema,
} from '../schema/features'
import type { PricingModelWithProductsAndUsageMeters } from '../schema/prices'
import { prices } from '../schema/prices'
import {
  type ProductFeature,
  productFeatures,
} from '../schema/productFeatures'
import { products } from '../schema/products'
import {
  type UsageMeter,
  usageMeters,
  usageMetersClientSelectSchema,
} from '../schema/usageMeters'
import {
  selectPricesAndProductsByProductWhere,
  updatePrice,
} from './priceMethods'
import { selectFeaturesByProductFeatureWhere } from './productFeatureMethods'
import { selectProducts } from './productMethods'

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

export const selectPricingModelsTableRows =
  createCursorPaginatedSelectFunction(
    pricingModels,
    config,
    pricingModelTableRowSchema,
    async (pricingModelsResult, transaction) => {
      const productsByPricingModelId = new Map<string, number>()

      if (pricingModelsResult.length > 0) {
        const products = await selectProducts(
          {
            pricingModelId: pricingModelsResult.map(
              (pricingModel) => pricingModel.id
            ),
          },
          transaction
        )

        products.forEach((product: { pricingModelId: string }) => {
          const currentCount =
            productsByPricingModelId.get(product.pricingModelId) || 0
          productsByPricingModelId.set(
            product.pricingModelId,
            currentCount + 1
          )
        })
      }

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
     * Implementation note:
     * it is actually fairly important to do this in two steps,
     * because pricingModels are one-to-many with products, so we couldn't
     * easily describe our desired "limit" result.
     * But in two steps, we can limit the pricingModels, and then get the
     * products for each pricingModel.
     * This COULD create a performance issue if there are a lot of products
     * to fetch, but in practice it should be fine.
     */
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

    const uniquePricingModelsMap = new Map<
      string,
      PricingModel.ClientRecord
    >()
    const usageMetersByPricingModelId = new Map<
      string,
      UsageMeter.ClientRecord[]
    >()
    pricingModelResults.forEach(({ pricingModel, usageMeter }) => {
      uniquePricingModelsMap.set(
        pricingModel.id,
        pricingModelsClientSelectSchema.parse(pricingModel)
      )
      const oldMeters =
        usageMetersByPricingModelId.get(pricingModel.id) ?? []
      if (usageMeter) {
        usageMetersByPricingModelId.set(pricingModel.id, [
          ...oldMeters,
          usageMetersClientSelectSchema.parse(usageMeter),
        ])
      }
    })

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
    return uniquePricingModels.map((pricingModel) => ({
      ...pricingModel,
      usageMeters:
        usageMetersByPricingModelId.get(pricingModel.id) ?? [],
      products: productsByPricingModelId.get(pricingModel.id) ?? [],
      defaultProduct:
        productsByPricingModelId
          .get(pricingModel.id)
          ?.find((product) => product.default) ?? undefined,
    }))
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
      return {
        ...pricingModel,
        products: pricingModel.products
          .filter((product) => product.active)
          .map((product) => ({
            ...product,
            prices: product.prices.filter((price) => price.active),
          }))
          .filter((product) => product.prices.length > 0), // Filter out products with no active prices
      }
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

  return {
    ...pricingModel,
    products: pricingModel.products
      .filter((product) => product.active)
      .map((product) => ({
        ...product,
        prices: product.prices.filter((price) => price.active),
      }))
      .filter((product) => product.prices.length > 0), // Filter out products with no active prices
  }
}

/**
 * Minimal price data needed for slug resolution in bulk usage event processing.
 * Only contains fields required to map price slugs to IDs.
 */
export type PriceSlugInfo = {
  id: string
  slug: string | null
  type: PriceType
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
    // 2. usageMeterSlug is not null AND not empty string
    // 3. We haven't already seen this usage meter ID (de-dupe)
    if (
      row.usageMeterId &&
      row.usageMeterSlug &&
      row.usageMeterSlug.trim() !== '' &&
      !pm.seenUsageMeterIds.has(row.usageMeterId)
    ) {
      pm.seenUsageMeterIds.add(row.usageMeterId)
      pm.usageMeters.push({
        id: row.usageMeterId,
        slug: row.usageMeterSlug,
      })
    }
  })

  const pricingModelIds = Array.from(pricingModelMap.keys())
  if (pricingModelIds.length === 0) {
    return []
  }

  // Query 2: Fetch prices with minimal fields (skip products entirely)
  // Only fetch prices where the product is active (matches selectPricingModelForCustomer behavior)
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
        eq(products.active, true) // Only active products (matches selectPricingModelForCustomer)
      )
    )

  // Group prices by pricing model
  // De-duplicate by price ID in case of any edge cases
  const pricesByPricingModelId = new Map<string, PriceSlugInfo[]>()
  const seenPriceIds = new Set<string>()

  priceResults.forEach((row) => {
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
      type: row.priceType as PriceType,
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
