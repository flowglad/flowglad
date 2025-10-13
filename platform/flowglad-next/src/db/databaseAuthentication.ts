import { adminTransaction } from './adminTransaction'
import { verifyKey } from '@unkey/api'
import db from './client'
import { z } from 'zod'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import { type Session } from '@supabase/supabase-js'
import core from '@/utils/core'
import { memberships } from './schema/memberships'
import { users, usersSelectSchema } from './schema/users'
import { selectApiKeys } from './tableMethods/apiKeyMethods'
import { selectMembershipsAndUsersByMembershipWhere } from './tableMethods/membershipMethods'
import { FlowgladApiKeyType } from '@/types'
import { JwtPayload } from 'jsonwebtoken'
import { customers, customersSelectSchema } from './schema/customers'
import { ApiKey } from './schema/apiKeys'
import { parseUnkeyMeta } from '@/utils/unkey'
import { auth, getSession } from '@/utils/auth'
import { User } from 'better-auth'
import { getCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { headers } from 'next/headers'

type SessionUser = Session['user']

export interface JWTClaim extends JwtPayload {
  user_metadata: SessionUser
  app_metadata: SessionUser['app_metadata']
  email: string
  role: string
  organization_id: string
}

interface KeyVerifyResult {
  keyType: FlowgladApiKeyType
  userId: string
  ownerId: string
  environment: string
  metadata: ApiKey.ApiKeyMetadata
}

const userIdFromUnkeyMeta = (meta: ApiKey.ApiKeyMetadata) => {
  switch (meta.type) {
    case FlowgladApiKeyType.Secret:
      return (meta as ApiKey.SecretMetadata).userId
    case FlowgladApiKeyType.BillingPortalToken:
      return (meta as ApiKey.BillingPortalMetadata)
        .stackAuthHostedBillingUserId
    default:
      throw new Error(
        `userIdFromUnkeyMeta: received invalid API key type`
      )
  }
}
/**
 * Returns the userId of the user associated with the key, or undefined if the key is invalid.
 * @param key
 * @returns
 */
async function keyVerify(key: string): Promise<KeyVerifyResult> {
  if (!core.IS_TEST) {
    const { result, error } = await verifyKey({
      key,
      apiId: core.envVariable('UNKEY_API_ID'),
    })
    if (error) {
      throw error
    }
    if (!result) {
      throw new Error('No result for provided API key')
    }
    const meta = parseUnkeyMeta(result.meta)
    return {
      keyType: meta.type,
      userId: userIdFromUnkeyMeta(meta),
      ownerId: result.ownerId as string,
      environment: result.environment as string,
      metadata: meta,
    }
  }

  const {
    membershipAndUser,
    organizationId,
    apiKeyType,
    apiKeyLivemode,
  } = await adminTransaction(async ({ transaction }) => {
    const [apiKeyRecord] = await selectApiKeys(
      {
        token: key,
      },
      transaction
    )
    const [membershipAndUser] =
      await selectMembershipsAndUsersByMembershipWhere(
        {
          organizationId: apiKeyRecord.organizationId,
        },
        transaction
      )
    return {
      membershipAndUser,
      organizationId: apiKeyRecord.organizationId,
      apiKeyType: apiKeyRecord.type,
      apiKeyLivemode: apiKeyRecord.livemode,
    }
  })
  return {
    keyType: apiKeyType,
    userId: membershipAndUser.user.id,
    ownerId: organizationId,
    environment: apiKeyLivemode ? 'live' : 'test',
    metadata: {
      type: apiKeyType as FlowgladApiKeyType.Secret,
      userId: membershipAndUser.user.id,
      organizationId: organizationId,
    },
  }
}

interface DatabaseAuthenticationInfo {
  userId: string
  livemode: boolean
  jwtClaim: JWTClaim
}

export async function dbAuthInfoForSecretApiKeyResult(
  verifyKeyResult: KeyVerifyResult
): Promise<DatabaseAuthenticationInfo> {
  if (verifyKeyResult.keyType !== FlowgladApiKeyType.Secret) {
    throw new Error(
      `dbAuthInfoForSecretApiKey: received invalid API key type: ${verifyKeyResult.keyType}`
    )
  }
  const membershipsForOrganization = await db
    .select()
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, verifyKeyResult.ownerId!),
        or(
          eq(memberships.userId, `${verifyKeyResult.userId}`),
          eq(users.clerkId, `${verifyKeyResult.userId}`)
        )
      )
    )
  const userId =
    membershipsForOrganization[0].users.id ??
    `${verifyKeyResult.userId}`
  const livemode = verifyKeyResult.environment === 'live'
  const jwtClaim: JWTClaim = {
    role: 'merchant',
    sub: userId,
    email: 'apiKey@example.com',
    session_id: 'mock_session_123',
    organization_id: verifyKeyResult.ownerId,
    user_metadata: {
      id: userId,
      user_metadata: {},
      aud: 'stub',
      email: 'apiKey@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'merchant',
      app_metadata: {
        provider: 'apiKey',
      },
    },
    app_metadata: { provider: 'apiKey' },
  }
  return {
    userId,
    livemode,
    jwtClaim,
  }
}

export async function dbAuthInfoForBillingPortalApiKeyResult(
  verifyKeyResult: KeyVerifyResult
): Promise<DatabaseAuthenticationInfo> {
  if (
    verifyKeyResult.keyType !== FlowgladApiKeyType.BillingPortalToken
  ) {
    throw new Error(
      `dbAuthInfoForBillingPortalApiKey: received invalid API key type: ${verifyKeyResult.keyType}`
    )
  }
  const livemode = verifyKeyResult.environment === 'live'
  const billingMetadata =
    verifyKeyResult.metadata as ApiKey.BillingPortalMetadata
  if (!billingMetadata) {
    throw new Error(
      `dbAuthInfoForBillingPortalApiKey: received invalid API key metadata: ${verifyKeyResult.metadata}`
    )
  }
  if (!billingMetadata.organizationId) {
    throw new Error(
      `dbAuthInfoForBillingPortalApiKey: received invalid API key metadata: ${verifyKeyResult.metadata}`
    )
  }
  if (!billingMetadata.stackAuthHostedBillingUserId) {
    throw new Error(
      `dbAuthInfoForBillingPortalApiKey: received invalid API key metadata: ${verifyKeyResult.metadata}`
    )
  }
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organizationId, billingMetadata.organizationId),
        eq(
          customers.stackAuthHostedBillingUserId,
          billingMetadata.stackAuthHostedBillingUserId
        )
      )
    )
  if (!customer) {
    throw new Error(
      `Billing Portal Authentication Error: No customer found with externalId ${verifyKeyResult.ownerId}.`
    )
  }
  const membershipsForOrganization = await db
    .select()
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(eq(memberships.organizationId, customer.organizationId))
    )
    .orderBy(asc(memberships.createdAt))

  if (membershipsForOrganization.length === 0) {
    throw new Error(
      `Billing Portal Authentication Error: No memberships found for organization ${verifyKeyResult.ownerId}.`
    )
  }
  const userId = membershipsForOrganization[0].users.id
  const jwtClaim: JWTClaim = {
    role: 'merchant',
    sub: userId,
    email: 'apiKey@example.com',
    user_metadata: {
      id: userId,
      user_metadata: {},
      aud: 'stub',
      email: 'apiKey@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'merchant',
      app_metadata: {
        provider: 'apiKey',
      },
    },
    organization_id: customer.organizationId,
    app_metadata: {
      provider: 'apiKey',
    },
  }
  return {
    userId,
    livemode,
    jwtClaim,
  }
}

export const requestingCustomerAndUser = async ({
  betterAuthId,
  organizationId,
}: {
  betterAuthId: string
  organizationId: string
}) => {
  const result = await db
    .select({
      customer: customers,
      user: users,
    })
    .from(customers)
    .innerJoin(users, eq(customers.userId, users.id))
    .where(
      and(
        eq(users.betterAuthId, betterAuthId),
        eq(customers.organizationId, organizationId),
        /**
         * For now, only support granting access to livemode customers,
         * so we can avoid unintentionally allowing customers to get access
         * to test mode customers for the merchant who match their email.
         *
         * FIXME: support billing portal access for test mode customers specifically.
         * This will require more sophisticated auth business logic.
         */
        eq(customers.livemode, true)
      )
    )
    .limit(1)
  return z
    .object({
      customer: customersSelectSchema,
      user: usersSelectSchema,
    })
    .array()
    .parse(result)
}

export const dbInfoForCustomerBillingPortal = async ({
  betterAuthId,
  organizationId,
}: {
  betterAuthId: string
  organizationId: string
}): Promise<DatabaseAuthenticationInfo> => {
  const [result] = await requestingCustomerAndUser({
    betterAuthId,
    organizationId,
  })
  if (!result) {
    await auth.api.signOut({
      headers: await headers(),
    })
    throw new Error('Customer not found')
  }
  const { customer, user } = result
  return {
    userId: user.id,
    livemode: customer.livemode,
    jwtClaim: {
      role: 'customer',
      sub: user.id,
      email: user.email!,
      organization_id: customer.organizationId,
      user_metadata: {
        id: user.id,
        user_metadata: {},
        aud: 'stub',
        email: user.email!,
        role: 'customer',
        created_at: new Date(user.createdAt).toISOString(),
        updated_at: user.updatedAt
          ? new Date(user.updatedAt).toISOString()
          : new Date().toISOString(),
        app_metadata: {
          provider: 'customerBillingPortal',
        },
      },
      app_metadata: { provider: 'customerBillingPortal' },
    },
  }
}

export async function databaseAuthenticationInfoForWebappRequest(
  user: User,
  __testOnlyOrganizationId?: string | undefined
): Promise<DatabaseAuthenticationInfo> {
  const betterAuthId = user.id
  const customerOrganizationId =
    await getCustomerBillingPortalOrganizationId({
      __testOrganizationId: __testOnlyOrganizationId,
    })

  if (customerOrganizationId) {
    return await dbInfoForCustomerBillingPortal({
      betterAuthId: user.id,
      organizationId: customerOrganizationId,
    })
  }

  const [focusedMembership] = await db
    .select()
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(users.betterAuthId, betterAuthId)))
    .orderBy(desc(memberships.focused))
    .limit(1)
  const userId = focusedMembership?.memberships.userId
  const livemode = focusedMembership?.memberships.livemode ?? false
  const jwtClaim = {
    role: 'merchant',
    sub: userId,
    email: user.email,
    user_metadata: {
      id: userId,
      user_metadata: {},
      aud: 'stub',
      email: user.email,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'merchant',
      app_metadata: {
        provider: '',
      },
    },
    organization_id:
      focusedMembership?.memberships.organizationId ?? '',
    app_metadata: { provider: 'apiKey' },
  }
  return {
    userId,
    livemode,
    jwtClaim,
  }
}

export async function databaseAuthenticationInfoForApiKeyResult(
  verifyKeyResult: KeyVerifyResult
): Promise<DatabaseAuthenticationInfo> {
  if (!verifyKeyResult.userId) {
    throw new Error('Invalid API key, no userId')
  }
  if (!verifyKeyResult.ownerId) {
    throw new Error('Invalid API key, no ownerId')
  }
  switch (verifyKeyResult.keyType) {
    case FlowgladApiKeyType.Secret:
      return dbAuthInfoForSecretApiKeyResult(verifyKeyResult)
    case FlowgladApiKeyType.BillingPortalToken:
      return dbAuthInfoForBillingPortalApiKeyResult(verifyKeyResult)
    default:
      throw new Error(
        `databaseAuthenticationInfoForApiKey: received invalid API key type: ${verifyKeyResult.keyType}`
      )
  }
}

export async function getDatabaseAuthenticationInfo(params: {
  apiKey: string | undefined
  __testOnlyOrganizationId?: string
}): Promise<DatabaseAuthenticationInfo> {
  const { apiKey, __testOnlyOrganizationId } = params
  if (apiKey) {
    const verifyKeyResult = await keyVerify(apiKey)
    return await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult
    )
  }

  const sessionResult = await getSession()
  if (!sessionResult) {
    throw new Error('No user found for a non-API key transaction')
  }
  return await databaseAuthenticationInfoForWebappRequest(
    sessionResult.user as User,
    __testOnlyOrganizationId
  )
}
