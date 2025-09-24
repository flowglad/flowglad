import { protectedProcedure } from '@/server/trpc'
import { editFileInputSchema } from '@/db/schema/files'
import { updateFile } from '@/db/tableMethods/fileMethods'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'

export const updateFile = protectedProcedure
  .input(editFileInputSchema)
  .mutation(async ({ input, ctx }) => {
    const updatedFile = await authenticatedTransaction(
      async ({ transaction }) => {
        return updateFile(input.file, transaction)
      }
    )
    return {
      file: updatedFile,
    }
  })
