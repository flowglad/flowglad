import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { deleteLink } from '@/db/tableMethods/linkMethods'
import { idInputSchema } from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'

export const deleteLinkProcedure = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    await authenticatedTransaction(async ({ transaction }) => {
      await deleteLink(input.id, transaction)
    })
    return { success: true }
  })
