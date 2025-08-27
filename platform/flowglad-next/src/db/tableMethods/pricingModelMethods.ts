import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createPaginatedSelectFunction,
  createCursorPaginatedSelectFunction,
  ORMMethodCreatorConfig,
  SelectConditions,
  whereClauseFromObject,
} from '@/db/tableUtils'
import {
  PricingModel,
  pricingModels,
  pricingModelsClientSelectSchema,
  pricingModelsInsertSchema,
  pricingModelsSelectSchema,
  pricingModelsUpdateSchema,
} from '@/db/schema/pricingModels'
import { DbTransaction } from '@/db/types'
import { count, eq, and } from 'drizzle-orm'
import { products } from '../schema/products'
import {
  selectPricesAndProductsByProductWhere,
  updatePrice,
} from './priceMethods'
import { PricingModelWithProductsAndUsageMeters } from '../schema/prices'
import { Customer } from '@/db/schema/customers'
import {
  UsageMeter,
  usageMeters,
  usageMetersClientSelectSchema,
} from '../schema/usageMeters'
import { selectProducts } from './productMethods'
import { z } from 'zod'

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
  const [catalog] = await selectPricingModels(
    { organizationId, livemode, isDefault: true },
    transaction
  )
  if (!catalog) {
    return null
  }
  return catalog
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
  organizationId: string,
  transaction: DbTransaction
) => {
  await transaction
    .update(pricingModels)
    .set({ isDefault: false })
    .where(eq(pricingModels.organizationId, organizationId))
  return true
}

export const safelyUpdatePricingModel = async (
  catalog: PricingModel.Update,
  transaction: DbTransaction
) => {
  /**
   * If price is default
   */
  if (catalog.isDefault) {
    const existingPricingModel = await selectPricingModelById(
      catalog.id,
      transaction
    )
    await setPricingModelsForOrganizationToNonDefault(
      existingPricingModel.organizationId,
      transaction
    )
  }
  return updatePricingModel(catalog, transaction)
}

export const safelyInsertPricingModel = async (
  catalog: PricingModel.Insert,
  transaction: DbTransaction
) => {
  if (catalog.isDefault) {
    await setPricingModelsForOrganizationToNonDefault(
      catalog.organizationId,
      transaction
    )
  }
  return insertPricingModel(catalog, transaction)
}

const catalogTableRowSchema = z.object({
  pricingModel: pricingModelsClientSelectSchema,
  productsCount: z.number(),
})

export const selectPricingModelsTableRows =
  createCursorPaginatedSelectFunction(
    pricingModels,
    config,
    catalogTableRowSchema,
    async (pricingModels, transaction) => {
      const productsByPricingModelId = new Map<string, number>()

      if (pricingModels.length > 0) {
        const products = await selectProducts(
          {
            pricingModelId: pricingModels.map(
              (catalog) => catalog.id
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

      return pricingModels.map((catalog) => ({
        pricingModel: catalog,
        productsCount: productsByPricingModelId.get(catalog.id) || 0,
      }))
    }
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
     * easily describe our desired "limit" result easily.
     * But in two steps, we can limit the pricingModels, and then get the
     * products for each catalog.
     * This COULD create a performance issue if there are a lot of products
     * to fetch, but in practice it should be fine.
     */
    const catalogResults = await transaction
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
    catalogResults.forEach(({ pricingModel, usageMeter }) => {
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
 * Gets the catalog for a customer. If no catalog explicitly associated,
 * returns the default catalog for the organization.
 * @param customer
 * @param transaction
 * @returns
 */
export const selectPricingModelForCustomer = async (
  customer: Customer.Record,
  transaction: DbTransaction
): Promise<PricingModelWithProductsAndUsageMeters> => {
  if (customer.catalogId) {
    const [catalog] =
      await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
        { id: customer.catalogId },
        transaction
      )
    if (catalog) {
      return catalog
    }
  }
  const [catalog] =
    await selectPricingModelsWithProductsAndUsageMetersByPricingModelWhere(
      { isDefault: true, organizationId: customer.organizationId },
      transaction
    )
  return {
    ...catalog,
    products: catalog.products.filter((product) => product.active),
  }
}
