import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { idInputSchema } from '@/db/tableUtils'
import { deleteFile } from '@/db/tableMethods/fileMethods'

export const deleteFileProcedure = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    await authenticatedTransaction(async ({ transaction }) => {
      await deleteFile(input.id, transaction)
    })
    return { success: true }
  })
