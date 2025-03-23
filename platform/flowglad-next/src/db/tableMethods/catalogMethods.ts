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
): Promise<Catalog.WithProducts[]> => {
  const catalogsWithProducts = await transaction
    .select({
      catalog: catalogs,
      product: products,
    })
    .from(catalogs)
    .leftJoin(products, eq(catalogs.id, products.catalogId))
    .where(whereClauseFromObject(catalogs, where))
    .limit(100)
    .orderBy(catalogs.createdAt)

  const uniqueCatalogsMap = new Map<string, Catalog.ClientRecord>()
  catalogsWithProducts.forEach(({ catalog, product }) => {
    uniqueCatalogsMap.set(
      catalog.id,
      catalogsClientSelectSchema.parse(catalog)
    )
  })
  const productsByCatalogId = new Map<
    string,
    Product.ClientRecord[]
  >()
  catalogsWithProducts.forEach(({ catalog, product }) => {
    productsByCatalogId.set(catalog.id, [
      productsClientSelectSchema.parse(product),
    ])
  })
  const uniqueCatalogs = Array.from(uniqueCatalogsMap.values())
  return uniqueCatalogs.map((catalog) => ({
    ...catalog,
    products: productsByCatalogId.get(catalog.id) || [],
  }))
}
