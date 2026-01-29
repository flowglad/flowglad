import { rotateApiKeySchema } from '@db-core/schema/apiKeys'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { protectedProcedure } from '@/server/trpc'
import { rotateSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { logger } from '@/utils/logger'
import { deleteApiKey } from '@/utils/unkey'

export const rotateApiKeyProcedure = protectedProcedure
  .input(rotateApiKeySchema)
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        return rotateSecretApiKeyTransaction(input, {
          transaction,
          userId,
        })
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    /**
     * Invalidate the old key in Unkey,
     * but only after the transaction has been committed.
     * The avoids the case of a failed transaction which would invalidate the key in unkey,
     * but fail to mark it as inactive in our database.
     */
    if (result.oldApiKey.unkeyId) {
      try {
        await deleteApiKey(result.oldApiKey.unkeyId)
      } catch (error) {
        logger.error('Failed to delete rotated API key from Unkey', {
          error:
            error instanceof Error ? error : new Error(String(error)),
          unkeyId: result.oldApiKey.unkeyId,
          apiKeyId: result.oldApiKey.id,
        })
        throw error
      }
    } else {
      logger.warn(
        'Rotated API key has no unkeyId; cannot delete old key from Unkey',
        {
          apiKeyId: result.oldApiKey.id,
        }
      )
    }
    return {
      apiKey: result.newApiKey,
      shownOnlyOnceKey: result.shownOnlyOnceKey,
    }
  })
