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
  Catalog,
  catalogs,
  catalogsClientSelectSchema,
  catalogsInsertSchema,
  catalogsSelectSchema,
  catalogsUpdateSchema,
} from '@/db/schema/catalogs'
import { DbTransaction } from '@/db/types'
import { count, eq, and } from 'drizzle-orm'
import { products } from '../schema/products'
import {
  selectPricesAndProductsByProductWhere,
  updatePrice,
} from './priceMethods'
import { CatalogWithProductsAndUsageMeters } from '../schema/prices'
import { Customer } from '@/db/schema/customers'
import {
  UsageMeter,
  usageMeters,
  usageMetersClientSelectSchema,
} from '../schema/usageMeters'
import { selectProducts } from './productMethods'
import { z } from 'zod'

const config: ORMMethodCreatorConfig<
  typeof catalogs,
  typeof catalogsSelectSchema,
  typeof catalogsInsertSchema,
  typeof catalogsUpdateSchema
> = {
  selectSchema: catalogsSelectSchema,
  insertSchema: catalogsInsertSchema,
  updateSchema: catalogsUpdateSchema,
  tableName: 'catalogs',
}

export const selectCatalogById = createSelectById(catalogs, config)

export const insertCatalog = createInsertFunction(catalogs, config)

export const updateCatalog = createUpdateFunction(catalogs, config)

export const selectCatalogs = createSelectFunction(catalogs, config)

export const selectCatalogsPaginated = createPaginatedSelectFunction(
  catalogs,
  config
)

export const selectDefaultCatalog = async (
  {
    organizationId,
    livemode,
  }: { organizationId: string; livemode: boolean },
  transaction: DbTransaction
): Promise<Catalog.Record | null> => {
  const [catalog] = await selectCatalogs(
    { organizationId, livemode, isDefault: true },
    transaction
  )
  if (!catalog) {
    return null
  }
  return catalog
}

export const makeCatalogDefault = async (
  newDefaultCatalogOrId: Catalog.Record | string,
  transaction: DbTransaction
) => {
  const newDefaultCatalog =
    typeof newDefaultCatalogOrId === 'string'
      ? await selectCatalogById(newDefaultCatalogOrId, transaction)
      : newDefaultCatalogOrId
  const oldDefaultCatalog = await selectDefaultCatalog(
    {
      organizationId: newDefaultCatalog.organizationId,
      livemode: newDefaultCatalog.livemode,
    },
    transaction
  )
  if (oldDefaultCatalog) {
    await updateCatalog(
      { id: oldDefaultCatalog.id, isDefault: false },
      transaction
    )
  }
  const updatedCatalog = await updateCatalog(
    { id: newDefaultCatalog.id, isDefault: true },
    transaction
  )
  return updatedCatalog
}

const setCatalogsForOrganizationToNonDefault = async (
  organizationId: string,
  transaction: DbTransaction
) => {
  await transaction
    .update(catalogs)
    .set({ isDefault: false })
    .where(eq(catalogs.organizationId, organizationId))
  return true
}

export const safelyUpdateCatalog = async (
  catalog: Catalog.Update,
  transaction: DbTransaction
) => {
  /**
   * If price is default
   */
  if (catalog.isDefault) {
    const existingCatalog = await selectCatalogById(
      catalog.id,
      transaction
    )
    await setCatalogsForOrganizationToNonDefault(
      existingCatalog.organizationId,
      transaction
    )
  }
  return updateCatalog(catalog, transaction)
}

export const safelyInsertCatalog = async (
  catalog: Catalog.Insert,
  transaction: DbTransaction
) => {
  if (catalog.isDefault) {
    await setCatalogsForOrganizationToNonDefault(
      catalog.organizationId,
      transaction
    )
  }
  return insertCatalog(catalog, transaction)
}

const catalogTableRowSchema = z.object({
  catalog: catalogsClientSelectSchema,
  productsCount: z.number(),
})

export const selectCatalogsTableRows =
  createCursorPaginatedSelectFunction(
    catalogs,
    config,
    catalogTableRowSchema,
    async (catalogs, transaction) => {
      const productsByCatalogId = new Map<string, number>()

      if (catalogs.length > 0) {
        const products = await selectProducts(
          { catalogId: catalogs.map((catalog) => catalog.id) },
          transaction
        )

        products.forEach((product: { catalogId: string }) => {
          const currentCount =
            productsByCatalogId.get(product.catalogId) || 0
          productsByCatalogId.set(product.catalogId, currentCount + 1)
        })
      }

      return catalogs.map((catalog) => ({
        catalog,
        productsCount: productsByCatalogId.get(catalog.id) || 0,
      }))
    }
  )

export const selectCatalogsWithProductsAndUsageMetersByCatalogWhere =
  async (
    where: SelectConditions<typeof catalogs>,
    transaction: DbTransaction
  ): Promise<CatalogWithProductsAndUsageMeters[]> => {
    /**
     * Implementation note:
     * it is actually fairly important to do this in two steps,
     * because catalogs are one-to-many with products, so we couldn't
     * easily describe our desired "limit" result easily.
     * But in two steps, we can limit the catalogs, and then get the
     * products for each catalog.
     * This COULD create a performance issue if there are a lot of products
     * to fetch, but in practice it should be fine.
     */
    const catalogResults = await transaction
      .select({
        catalog: catalogs,
        usageMeter: usageMeters,
      })
      .from(catalogs)
      .leftJoin(usageMeters, eq(catalogs.id, usageMeters.catalogId))
      .where(whereClauseFromObject(catalogs, where))
      .limit(100)
      .orderBy(catalogs.createdAt)

    const uniqueCatalogsMap = new Map<string, Catalog.ClientRecord>()
    const usageMetersByCatalogId = new Map<
      string,
      UsageMeter.ClientRecord[]
    >()
    catalogResults.forEach(({ catalog, usageMeter }) => {
      uniqueCatalogsMap.set(
        catalog.id,
        catalogsClientSelectSchema.parse(catalog)
      )
      const oldMeters = usageMetersByCatalogId.get(catalog.id) ?? []
      if (usageMeter) {
        usageMetersByCatalogId.set(catalog.id, [
          ...oldMeters,
          usageMetersClientSelectSchema.parse(usageMeter),
        ])
      }
    })

    const productResults =
      await selectPricesAndProductsByProductWhere(
        { catalogId: Array.from(uniqueCatalogsMap.keys()) },
        transaction
      )
    const productsByCatalogId = new Map<
      string,
      CatalogWithProductsAndUsageMeters['products']
    >()
    productResults.forEach(({ prices, ...product }) => {
      productsByCatalogId.set(product.catalogId, [
        ...(productsByCatalogId.get(product.catalogId) || []),
        {
          ...product,
          prices,
          defaultPrice:
            prices.find((price) => price.isDefault) ?? prices[0],
        },
      ])
    })

    const uniqueCatalogs = Array.from(uniqueCatalogsMap.values())
    return uniqueCatalogs.map((catalog) => ({
      ...catalog,
      usageMeters: usageMetersByCatalogId.get(catalog.id) ?? [],
      products: productsByCatalogId.get(catalog.id) ?? [],
    }))
  }

/**
 * Gets the catalog for a customer. If no catalog explicitly associated,
 * returns the default catalog for the organization.
 * @param customer
 * @param transaction
 * @returns
 */
export const selectCatalogForCustomer = async (
  customer: Customer.Record,
  transaction: DbTransaction
): Promise<CatalogWithProductsAndUsageMeters> => {
  if (customer.catalogId) {
    const [catalog] =
      await selectCatalogsWithProductsAndUsageMetersByCatalogWhere(
        { id: customer.catalogId },
        transaction
      )
    if (catalog) {
      return catalog
    }
  }
  const [catalog] =
    await selectCatalogsWithProductsAndUsageMetersByCatalogWhere(
      { isDefault: true, organizationId: customer.organizationId },
      transaction
    )
  return {
    ...catalog,
    products: catalog.products.filter((product) => product.active),
  }
}
