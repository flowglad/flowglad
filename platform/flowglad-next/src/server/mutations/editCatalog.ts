import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { editCatalogSchema } from '@/db/schema/catalogs'
import { updateCatalog } from '@/db/tableMethods/catalogMethods'

export const editCatalog = protectedProcedure
  .input(editCatalogSchema)
  .mutation(async ({ input }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        return updateCatalog(input.catalog, transaction)
      }
    )
    return {
      data: { catalog },
    }
  })
