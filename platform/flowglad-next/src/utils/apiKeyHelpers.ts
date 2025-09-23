import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { FlowgladApiKeyType } from '@/types'
import {
  AuthenticatedTransactionParams,
} from '@/db/types'
import {
  createSecretApiKey,
  replaceSecretApiKey,
} from '@/utils/unkey'
import {
  insertApiKey,
  selectApiKeyById,
  updateApiKey,
} from '@/db/tableMethods/apiKeyMethods'
import {
  CreateApiKeyInput,
  RotateApiKeyInput,
} from '@/db/schema/apiKeys'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
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
  { transaction, userId }: AuthenticatedTransactionParams
) => {
  // Get the existing API key
  const existingApiKey = await selectApiKeyById(input.id, transaction)
  const organization = await selectOrganizationById(
    existingApiKey.organizationId,
    transaction
  )
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

export const getApiKeyHeader = (authorizationHeader: string) => {
  const authorizationFragments = authorizationHeader
    .trim()
    .split(/\s+/, 2)
  return authorizationFragments.length == 2
    ? authorizationFragments[1]
    : authorizationHeader
}
