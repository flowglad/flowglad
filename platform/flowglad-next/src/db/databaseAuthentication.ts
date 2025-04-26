import { adminTransaction } from './adminTransaction'
import { Unkey, verifyKey } from '@unkey/api'
import db from './client'
import { and, asc, eq, or, sql } from 'drizzle-orm'
import { type Session } from '@supabase/supabase-js'
import core from '@/utils/core'
import { memberships } from './schema/memberships'
import { stackServerApp } from '@/stack'
import { users } from './schema/users'
import { selectApiKeys } from './tableMethods/apiKeyMethods'
import { selectMembershipsAndUsersByMembershipWhere } from './tableMethods/membershipMethods'
import { ServerUser } from '@stackframe/stack'
import { FlowgladApiKeyType } from '@/types'
import { JwtPayload } from 'jsonwebtoken'
import { customers } from './schema/customers'
import { ApiKey, apiKeyMetadataSchema } from './schema/apiKeys'

type SessionUser = Session['user']

export interface JWTClaim extends JwtPayload {
  user_metadata: SessionUser
  app_metadata: SessionUser['app_metadata']
  email: string
  role: string
}

interface KeyVerifyResult {
  keyType: FlowgladApiKeyType
  userId: string
  ownerId: string
  environment: string
  metadata: ApiKey.ApiKeyMetadata
}

function backwardsCompatibleKeyTypeFromUnkeyApiKeyResult(
  result: Awaited<ReturnType<typeof verifyKey>>['result']
): FlowgladApiKeyType {
  console.log('result', result)
  if (!result) {
    throw new Error('No result from unkey verifyKey')
  }
  if (result.meta?.keyType) {
    return result.meta.keyType as FlowgladApiKeyType
  }
  return FlowgladApiKeyType.Secret
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
      throw new Error('No result')
    }
    const meta = apiKeyMetadataSchema.parse(result.meta)
    console.log('keyVerify', result)
    return {
      keyType: meta.type,
      userId: userIdFromUnkeyMeta(meta),
      ownerId: result.ownerId as string,
      environment: result.environment as string,
      metadata: meta,
    }
  }
  const { membershipAndUser, organizationId, apiKeyType } =
    await adminTransaction(async ({ transaction }) => {
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
      }
    })
  return {
    keyType: apiKeyType,
    userId: membershipAndUser.user.id,
    ownerId: organizationId,
    environment: 'test',
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

async function dbAuthInfoForSecretApiKey(
  verifyKeyResult: KeyVerifyResult
): Promise<DatabaseAuthenticationInfo> {
  console.log(' authenticating for secret api key')
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
  const jwtClaim = {
    role: 'authenticated',
    sub: userId,
    email: 'apiKey@example.com',
    session_id: 'mock_session_123',
    user_metadata: {
      id: userId,
      user_metadata: {},
      aud: 'stub',
      email: 'apiKey@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'authenticated',
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

async function dbAuthInfoForBillingPortalApiKey(
  verifyKeyResult: KeyVerifyResult
): Promise<DatabaseAuthenticationInfo> {
  console.log(' authenticating for billing portal api key')
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
  // TODO: scope this
  const jwtClaim = {
    role: 'authenticated',
    sub: userId,
    email: 'apiKey@example.com',
    user_metadata: {
      id: userId,
      user_metadata: {},
      aud: 'stub',
      email: 'apiKey@example.com',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'authenticated',
      app_metadata: {
        provider: 'apiKey',
      },
    },
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

export async function databaseAuthenticationInfoForWebappRequest(
  user: ServerUser
): Promise<DatabaseAuthenticationInfo> {
  const userId = user.id
  const [focusedMembership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.focused, true)
      )
    )
    .limit(1)
  const livemode = focusedMembership?.livemode ?? false
  const jwtClaim = {
    role: 'authenticated',
    sub: userId,
    email: user?.primaryEmail ?? '',
    user_metadata: {
      id: userId,
      user_metadata: {},
      aud: 'stub',
      email: user.primaryEmail ?? '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'authenticated',
      app_metadata: {
        provider: '',
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

export async function databaseAuthenticationInfoForApiKey(
  key: string
): Promise<DatabaseAuthenticationInfo> {
  console.log(' authenticating for api key')
  const verifyKeyResult = await keyVerify(key)
  if (!verifyKeyResult.userId) {
    throw new Error('Invalid API key, no userId')
  }
  if (!verifyKeyResult.ownerId) {
    throw new Error('Invalid API key, no ownerId')
  }
  switch (verifyKeyResult.keyType) {
    case FlowgladApiKeyType.Secret:
      return dbAuthInfoForSecretApiKey(verifyKeyResult)
    case FlowgladApiKeyType.BillingPortalToken:
      return dbAuthInfoForBillingPortalApiKey(verifyKeyResult)
    default:
      throw new Error(
        `databaseAuthenticationInfoForApiKey: received invalid API key type: ${verifyKeyResult.keyType}`
      )
  }
}

export async function getDatabaseAuthenticationInfo(
  apiKey: string | undefined
): Promise<DatabaseAuthenticationInfo> {
  if (apiKey) {
    return await databaseAuthenticationInfoForApiKey(apiKey)
  }
  const user = await stackServerApp.getUser()
  if (!user) {
    throw new Error('No user found for a non-API key transaction')
  }
  return await databaseAuthenticationInfoForWebappRequest(user)
}
