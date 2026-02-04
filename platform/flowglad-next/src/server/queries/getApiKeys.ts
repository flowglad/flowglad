import { apiKeyClientWhereClauseSchema } from '@db-core/schema/apiKeys'
import { Result } from 'better-result'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { protectedProcedure } from '@/server/trpc'

export const getApiKeys = protectedProcedure
  .input(apiKeyClientWhereClauseSchema)
  .query(async ({ ctx, input }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    const apiKeys = (
      await authenticatedTransaction(async ({ transaction }) => {
        return Result.ok(
          await selectApiKeys(
            { organizationId: ctx.organizationId, ...input },
            transaction
          )
        )
      })
    ).unwrap()

    return {
      data: { apiKeys },
    }
  })
