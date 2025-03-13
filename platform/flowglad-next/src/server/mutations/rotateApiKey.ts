import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { rotateApiKeySchema } from '@/db/schema/apiKeys'
import { decrypt } from '@/utils/encryption'
import {
  updateApiKey,
  selectApiKeyById,
  insertApiKey,
} from '@/db/tableMethods/apiKeyMethods'
import { deleteApiKey, replaceApiKey } from '@/utils/unkey'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'

export const rotateApiKeyProcedure = protectedProcedure
  .input(rotateApiKeySchema)
  .mutation(async ({ input }) => {
    const result = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        // Get the existing API key
        const existingApiKey = await selectApiKeyById(
          input.id,
          transaction
        )
        const organization = await selectOrganizationById(
          existingApiKey.organizationId,
          transaction
        )
        // Rotate the key in Unkey
        const { apiKeyInsert, shownOnlyOnceKey } =
          await replaceApiKey({
            oldApiKey: existingApiKey,
            organization,
            userId,
          })

        // Deactivate old key in our database
        await updateApiKey(
          {
            id: existingApiKey.id,
            active: false,
          },
          transaction
        )

        // Create new key record
        const newApiKeyRecord = await insertApiKey(
          apiKeyInsert,
          transaction
        )

        return {
          newApiKey: {
            ...newApiKeyRecord,
          },
          shownOnlyOnceKey,
          oldApiKey: existingApiKey,
        }
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
