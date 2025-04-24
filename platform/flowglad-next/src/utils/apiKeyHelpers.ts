import { selectFocusedMembershipAndOrganization } from '@/db/tableMethods/membershipMethods'
import { FlowgladApiKeyType } from '@/types'
import {
  AuthenticatedTransactionParams,
  DbTransaction,
} from '@/db/types'
import { createApiKey as createApiKeyUnkey } from '@/utils/unkey'
import { insertApiKey } from '@/db/tableMethods/apiKeyMethods'
import { ApiKey, CreateApiKeyInput } from '@/db/schema/apiKeys'
import { Organization } from '@/db/schema/organizations'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { User } from '@stackframe/stack'

export const createApiKeyTransaction = async (
  input: CreateApiKeyInput,
  { transaction, userId, livemode }: AuthenticatedTransactionParams
) => {
  // Get the focused membership and organization
  const focusedMembership =
    await selectFocusedMembershipAndOrganization(userId, transaction)
  if (!focusedMembership) {
    throw new Error('No focused membership found')
  }
  /**
   * Disable the creation of API keys in livemode if the organization does not have payouts enabled
   */
  if (
    !focusedMembership.organization.payoutsEnabled &&
    livemode &&
    input.apiKey.type === FlowgladApiKeyType.Secret
  ) {
    throw new Error(
      `createApiKey: Cannot create livemode secret key.` +
        `Organization ${focusedMembership.organization.name} does not have payouts enabled`
    )
  }
  // Create the API key
  const { apiKeyInsert, shownOnlyOnceKey } = await createApiKeyUnkey({
    name: input.apiKey.name,
    apiEnvironment: livemode ? 'live' : 'test',
    organization: focusedMembership.organization,
    userId,
    type: input.apiKey.type,
  })

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
  const { apiKeyInsert, shownOnlyOnceKey } = await createApiKeyUnkey({
    name: params.name,
    apiEnvironment: params.livemode ? 'live' : 'test',
    organization: params.organization,
    userId: params.stackAuthHostedBillingUserId,
    type: FlowgladApiKeyType.BillingPortalToken,
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
