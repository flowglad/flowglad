import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { apiKeyClientWhereClauseSchema } from '@/db/schema/apiKeys'

export const getApiKeys = protectedProcedure
  .input(apiKeyClientWhereClauseSchema)
  .query(async ({ ctx, input }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    const apiKeys = await authenticatedTransaction(
      async ({ transaction }) => {
        return selectApiKeys(
          { organizationId: ctx.organizationId, ...input },
          transaction
        )
      }
    )

    return {
      data: { apiKeys },
    }
  })
