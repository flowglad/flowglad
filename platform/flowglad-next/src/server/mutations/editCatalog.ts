import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { editCatalogSchema } from '@/db/schema/catalogs'
import {
  makeCatalogDefault,
  updateCatalog,
} from '@/db/tableMethods/catalogMethods'

export const editCatalog = protectedProcedure
  .input(editCatalogSchema)
  .mutation(async ({ input }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        const catalog = await updateCatalog(
          input.catalog,
          transaction
        )
        if (catalog.isDefault) {
          return makeCatalogDefault(catalog, transaction)
        }
        return catalog
      }
    )
    return {
      data: { catalog },
    }
  })
