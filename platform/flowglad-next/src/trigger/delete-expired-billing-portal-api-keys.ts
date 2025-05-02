import { logger, task } from '@trigger.dev/sdk'
import { adminTransaction } from '@/db/adminTransaction'
import { select7DaysExpiredBillingPortalApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { deleteApiKey } from '@/utils/unkey'
import { FlowgladApiKeyType } from '@/types'

export const deleteExpiredBillingPortalApiKeysTask = task({
  id: 'delete-expired-billing-portal-api-keys',
  run: async (payload: any, { ctx }) => {
    logger.log('Starting to delete expired billing portal API keys', {
      payload,
      ctx,
    })

    const result = await adminTransaction(async ({ transaction }) => {
      // Get all billing portal API keys that expired more than 7 days ago
      const expiredApiKeys =
        await select7DaysExpiredBillingPortalApiKeys(transaction)
      const extraSafeExpiredOnlyBillingPortalKeys = expiredApiKeys
        .filter(
          (key) => key.type === FlowgladApiKeyType.BillingPortalToken
        )
        .filter(
          (key) =>
            key.expiresAt &&
            key.expiresAt <
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        )
      logger.log(
        `Found ${extraSafeExpiredOnlyBillingPortalKeys.length} expired billing portal API keys to delete`
      )

      // Delete each API key
      for (const apiKey of extraSafeExpiredOnlyBillingPortalKeys) {
        // Use type assertion to access unkeyId
        const keyWithUnkeyId = apiKey as unknown as {
          unkeyId?: string
          id: string
        }

        if (keyWithUnkeyId.unkeyId) {
          try {
            await deleteApiKey(keyWithUnkeyId.unkeyId)
            logger.log(
              `Successfully deleted API key with ID: ${keyWithUnkeyId.id}`
            )
          } catch (error) {
            logger.error(
              `Failed to delete API key with ID: ${keyWithUnkeyId.id}`,
              { error }
            )
          }
        } else {
          logger.warn(
            `API key with ID: ${keyWithUnkeyId.id} has no unkeyId, skipping deletion`
          )
        }
      }

      return {
        deletedCount: expiredApiKeys.length,
      }
    })

    return {
      message: `Deleted ${result.deletedCount} expired billing portal API keys`,
      deletedCount: result.deletedCount,
    }
  },
})
