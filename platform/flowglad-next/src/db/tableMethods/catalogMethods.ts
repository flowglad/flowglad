import {
  createSelectById,
  createInsertFunction,
  createUpdateFunction,
  createSelectFunction,
  ORMMethodCreatorConfig,
} from '@/db/tableUtils'
import {
  Catalog,
  catalogs,
  catalogsInsertSchema,
  catalogsSelectSchema,
  catalogsUpdateSchema,
} from '@/db/schema/catalogs'
import { DbTransaction } from '@/db/types'

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
