import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { createCatalogSchema } from '@/db/schema/catalogs'
import { insertCatalog } from '@/db/tableMethods/catalogMethods'

export const createCatalog = protectedProcedure
  .input(createCatalogSchema)
  .mutation(async ({ input, ctx }) => {
    const catalog = await authenticatedTransaction(
      async ({ transaction }) => {
        return insertCatalog(
          {
            ...input.catalog,
            livemode: ctx.livemode,
            organizationId: ctx.organizationId!,
          },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return {
      data: { catalog },
    }
  })
