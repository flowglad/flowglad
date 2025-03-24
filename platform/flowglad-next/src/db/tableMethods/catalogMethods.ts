import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  createPaginatedSelectFunction,
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
import { count, eq } from 'drizzle-orm'
import {
  Product,
  products,
  productsClientSelectSchema,
} from '../schema/products'
import {
  ProductWithPrices,
  selectPricesAndProductsByProductWhere,
} from './priceMethods'
import { CatalogWithProductsAndPrices } from '../schema/prices'
import { Customer } from '@/db/schema/customers'
const config: ORMMethodCreatorConfig<
  typeof catalogs,
  typeof catalogsSelectSchema,
  typeof catalogsInsertSchema,
  typeof catalogsUpdateSchema
> = {
  selectSchema: catalogsSelectSchema,
  insertSchema: catalogsInsertSchema,
  updateSchema: catalogsUpdateSchema,
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

export const selectCatalogsTableRows = async (
  where: SelectConditions<typeof catalogs>,
  transaction: DbTransaction
): Promise<Catalog.TableRow[]> => {
  const results = await transaction
    .select({
      catalog: catalogs,
      productsCount: count(products.id),
    })
    .from(catalogs)
    .leftJoin(products, eq(catalogs.id, products.catalogId))
    .where(whereClauseFromObject(catalogs, where))
    .groupBy(catalogs.id)
    .orderBy(catalogs.createdAt)

  return results.map(({ catalog, productsCount }) => ({
    catalog: catalogsClientSelectSchema.parse(catalog),
    productsCount: productsCount || 0,
  }))
}

export const selectCatalogsWithProductsByCatalogWhere = async (
  where: SelectConditions<typeof catalogs>,
  transaction: DbTransaction
): Promise<CatalogWithProductsAndPrices[]> => {
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
    .select()
    .from(catalogs)
    .where(whereClauseFromObject(catalogs, where))
    .limit(100)
    .orderBy(catalogs.createdAt)

  const uniqueCatalogsMap = new Map<string, Catalog.ClientRecord>()
  catalogResults.forEach((catalog) => {
    uniqueCatalogsMap.set(
      catalog.id,
      catalogsClientSelectSchema.parse(catalog)
    )
  })
  const productResults = await selectPricesAndProductsByProductWhere(
    { catalogId: catalogResults.map((catalog) => catalog.id) },
    transaction
  )
  const productsByCatalogId = new Map<
    string,
    CatalogWithProductsAndPrices['products']
  >()
  productResults.forEach(({ product, prices }) => {
    productsByCatalogId.set(product.catalogId, [
      ...(productsByCatalogId.get(product.catalogId) || []),
      {
        ...product,
        prices,
      },
    ])
  })

  const uniqueCatalogs = Array.from(uniqueCatalogsMap.values())
  return uniqueCatalogs.map((catalog) => ({
    ...catalog,
    products: productsByCatalogId.get(catalog.id) || [],
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
): Promise<CatalogWithProductsAndPrices> => {
  if (customer.catalogId) {
    const [catalog] = await selectCatalogsWithProductsByCatalogWhere(
      { id: customer.catalogId },
      transaction
    )
    if (catalog) {
      return catalog
    }
  }
  const [catalog] = await selectCatalogsWithProductsByCatalogWhere(
    { isDefault: true, organizationId: customer.organizationId },
    transaction
  )
  return catalog
}
