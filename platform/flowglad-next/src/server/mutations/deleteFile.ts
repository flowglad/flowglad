import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { deleteFile } from '@/db/tableMethods/fileMethods'
import { idInputSchema } from '@/db/tableUtils'
import { protectedProcedure } from '@/server/trpc'

export const deleteFileProcedure = protectedProcedure
  .input(idInputSchema)
  .mutation(async ({ input }) => {
    await authenticatedTransaction(async ({ transaction }) => {
      await deleteFile(input.id, transaction)
    })
    return { success: true }
  })
