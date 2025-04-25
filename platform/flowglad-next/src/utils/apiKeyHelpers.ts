import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { FlowgladApiKeyType } from '@/types'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import {
  createBillingPortalApiKey,
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
import { Organization } from '@/db/schema/organizations'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { User } from '@stackframe/stack'

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

export const createBillingPortalApiKeyTransaction = async (
  params: {
    organization: Organization.Record
    stackAuthHostedBillingUserId: string
    livemode: boolean
    name: string
  },
  transaction: DbTransaction
) => {
  // Create the API key
  const { apiKeyInsert, shownOnlyOnceKey } =
    await createBillingPortalApiKey({
      name: params.name,
      apiEnvironment: params.livemode ? 'live' : 'test',
      organization: params.organization,
      userId: params.stackAuthHostedBillingUserId,
      type: FlowgladApiKeyType.BillingPortalToken,
      stackAuthHostedBillingUserId:
        params.stackAuthHostedBillingUserId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    })

  // Insert the API key into the database
  const apiKey = await insertApiKey(apiKeyInsert, transaction)
  return {
    apiKey,
    shownOnlyOnceKey,
  }
}

export const verifyBillingPortalApiKeyTransaction = async (
  {
    organizationId,
    livemode,
    user,
  }: {
    organizationId: string
    livemode: boolean
    user: Pick<User, 'id'>
  },
  transaction: DbTransaction
) => {
  const organization = await selectOrganizationById(
    organizationId,
    transaction
  )
  const [customer] = await selectCustomers(
    {
      organizationId,
      stackAuthHostedBillingUserId: user.id,
      livemode,
    },
    transaction
  )
  if (!customer) {
    return null
  }

  const { apiKey, shownOnlyOnceKey } =
    await createBillingPortalApiKeyTransaction(
      {
        organization,
        stackAuthHostedBillingUserId: user.id,
        livemode,
        name: `Billing Portal Key for ${customer.name} (id: ${customer.id})`,
      },
      transaction
    )
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
  return {
    newApiKey: {
      ...newApiKeyRecord,
    },
    shownOnlyOnceKey,
    oldApiKey: existingApiKey,
  }
}
