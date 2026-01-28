import { Result } from 'better-result'
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

    const txResult = await authenticatedTransaction(
      async ({ transaction }) => {
        const apiKeys = await selectApiKeys(
          { organizationId: ctx.organizationId, ...input },
          transaction
        )
        return Result.ok(apiKeys)
      }
    )

    return {
      data: { apiKeys: txResult.unwrap() },
    }
  })
