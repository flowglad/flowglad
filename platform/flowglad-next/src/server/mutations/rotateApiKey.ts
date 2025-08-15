import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { rotateApiKeySchema } from '@/db/schema/apiKeys'
import { decrypt } from '@/utils/encryption'
import {
  updateApiKey,
  selectApiKeyById,
  insertApiKey,
} from '@/db/tableMethods/apiKeyMethods'
import { deleteApiKey, replaceSecretApiKey } from '@/utils/unkey'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { rotateSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'

export const rotateApiKeyProcedure = protectedProcedure
  .input(rotateApiKeySchema)
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction, userId, livemode, organizationId }) => {
        return rotateSecretApiKeyTransaction(input, {
          transaction,
          userId,
          livemode,
          organizationId,
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
    await deleteApiKey(result.oldApiKey.id)
    return {
      apiKey: result.newApiKey,
      shownOnlyOnceKey: result.shownOnlyOnceKey,
    }
  })
