import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { createFileInputSchema } from '@/db/schema/files'
import { protectedProcedure } from '@/server/trpc'
import { insertFileTransaction } from '@/utils/fileStorage'

export const createFile = protectedProcedure
  .input(createFileInputSchema)
  .meta({
    description: 'Create a file',
    examples: ['example1', 'example2'],
  })
  .mutation(async ({ input }) => {
    const file = await authenticatedTransaction(
      async ({ transaction, userId, livemode }) => {
        return insertFileTransaction(
          input.file,
          userId,
          livemode,
          transaction
        )
      }
    )

    return {
      file,
    }
  })

createFile._def.meta
