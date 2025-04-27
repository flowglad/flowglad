import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { deleteLink } from '@/db/tableMethods/linkMethods'

export const deleteLinkProcedure = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    await authenticatedTransaction(async ({ transaction }) => {
      await deleteLink(input.id, transaction)
    })
    return { success: true }
  })
