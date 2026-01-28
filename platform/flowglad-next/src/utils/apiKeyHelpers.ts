import type {
  CreateApiKeyInput,
  RotateApiKeyInput,
} from '@/db/schema/apiKeys'
import {
  deleteApiKey as deleteApiKeyMethod,
  insertApiKey,
  selectApiKeyById,
  updateApiKey,
} from '@/db/tableMethods/apiKeyMethods'
import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import type { AuthenticatedTransactionParams } from '@/db/types'
import { FlowgladApiKeyType } from '@/types'
import {
  createSecretApiKey,
  deleteApiKey as deleteApiKeyFromUnkey,
  replaceSecretApiKey,
} from '@/utils/unkey'
import { logger } from './logger'
import { deleteApiKeyVerificationResult } from './redis'

export const createSecretApiKeyTransaction = async (
  input: CreateApiKeyInput,
  { transaction, userId, livemode }: AuthenticatedTransactionParams
) => {
  if (input.apiKey.type !== FlowgladApiKeyType.Secret) {
    throw new Error(
      'createSecretApiKeyTransaction: Only secret keys are supported. Received type: ' +
        input.apiKey.type
    )
  }
  // Get the focused membership and organization
  const focusedMembership =
    await selectFocusedMembershipAndOrganization(userId, transaction)
  if (!focusedMembership) {
    throw new Error('No focused membership found')
  }
  /**
   * Disable the creation of API keys in livemode if the organization does not have payouts enabled
   */
  if (!focusedMembership.organization.payoutsEnabled && livemode) {
    throw new Error(
      `createApiKey: Cannot create livemode secret key.` +
        `Organization ${focusedMembership.organization.name} does not have payouts enabled`
    )
  }
  // Create the API key
  const { apiKeyInsert, shownOnlyOnceKey } = await createSecretApiKey(
    {
      name: input.apiKey.name,
      apiEnvironment: livemode ? 'live' : 'test',
      organization: focusedMembership.organization,
      userId,
      type: FlowgladApiKeyType.Secret,
    }
  )

  // Insert the API key into the database
  const apiKey = await insertApiKey(apiKeyInsert, transaction)

  return {
    apiKey,
    shownOnlyOnceKey,
  }
}

export const rotateSecretApiKeyTransaction = async (
  input: RotateApiKeyInput,
  {
    transaction,
    userId,
  }: Pick<AuthenticatedTransactionParams, 'transaction' | 'userId'>
) => {
  // Get the existing API key
  const existingApiKey = (
    await selectApiKeyById(input.id, transaction)
  ).unwrap()
  const organization = (
    await selectOrganizationById(
      existingApiKey.organizationId,
      transaction
    )
  ).unwrap()
  // Rotate the key in Unkey
  const { apiKeyInsert, shownOnlyOnceKey } =
    await replaceSecretApiKey({
      oldApiKey: existingApiKey,
      organization,
      userId,
    })

  // Deactivate old key in our database
  await updateApiKey(
    {
      ...existingApiKey,
      active: false,
    },
    transaction
  )

  // Create new key record
  const newApiKeyRecord = await insertApiKey(
    apiKeyInsert,
    transaction
  )

  await deleteApiKeyVerificationResult({
    hashText: existingApiKey.hashText ?? '',
  })

  return {
    newApiKey: {
      ...newApiKeyRecord,
    },
    shownOnlyOnceKey,
    oldApiKey: existingApiKey,
  }
}

export const deleteSecretApiKeyTransaction = async (
  input: { id: string },
  { transaction, userId }: AuthenticatedTransactionParams
): Promise<void> => {
  // Fetch the API key by ID to verify it exists and user has access
  const apiKey = (
    await selectApiKeyById(input.id, transaction)
  ).unwrap()

  // Validate it's a secret key
  if (apiKey.type !== FlowgladApiKeyType.Secret) {
    throw new Error(
      'deleteSecretApiKeyTransaction: Only secret keys can be deleted. Received type: ' +
        apiKey.type
    )
  }

  // Delete from Unkey first - if this fails, we abort the entire operation
  // to prevent orphaned keys that could still authenticate via Unkey
  if (apiKey.unkeyId) {
    try {
      await deleteApiKeyFromUnkey(apiKey.unkeyId)
    } catch (error) {
      logger.error('Failed to delete API key from Unkey', {
        error:
          error instanceof Error ? error : new Error(String(error)),
        unkeyId: apiKey.unkeyId,
        apiKeyId: apiKey.id,
        userId,
      })
      throw new Error(
        `Failed to delete API key from Unkey. Database deletion aborted to prevent orphaned key. unkeyId: ${apiKey.unkeyId}`
      )
    }
  }

  if (apiKey.hashText) {
    await deleteApiKeyVerificationResult({
      hashText: apiKey.hashText,
    })
  }

  await deleteApiKeyMethod(apiKey.id, transaction)
}

export const getApiKeyHeader = (authorizationHeader: string) => {
  const trimmed = authorizationHeader.trim()
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    // Only accept 'Bearer <key>'; reject all other prefixes
    return trimmed.slice('Bearer '.length)
  }
  // If there's no space (just a key), accept it
  if (!trimmed.includes(' ')) {
    return trimmed
  }
  // For any other type of Authorization header, reject
  return null
}
