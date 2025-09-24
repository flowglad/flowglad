import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { editLinkInputSchema } from '@/db/schema/links'
import { updateLink } from '@/db/tableMethods/linkMethods'

export const updateLink = protectedProcedure
  .input(editLinkInputSchema)
  .mutation(async ({ input }) => {
    const link = await authenticatedTransaction(
      async ({ transaction }) => {
        return updateLink(input.link, transaction)
      }
    )

    return {
      link,
    }
  })
