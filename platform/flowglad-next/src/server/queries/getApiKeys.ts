import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { apiKeyClientWhereClauseSchema } from '@/db/schema/apiKeys'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { protectedProcedure } from '@/server/trpc'

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
      },
      { operationName: 'getApiKeys' }
    )

    return {
      data: { apiKeys },
    }
  })
