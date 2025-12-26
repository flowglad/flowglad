import { and, eq } from 'drizzle-orm'
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
import {
  type Feature,
  features,
  featuresSelectSchema,
} from '../schema/features'
import type { PricingModelWithProductsAndUsageMeters } from '../schema/prices'
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
