import type { Session } from '@supabase/supabase-js'
import type { User } from 'better-auth'
import { Result } from 'better-result'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import type { JwtPayload } from 'jsonwebtoken'
import { z } from 'zod'
import { FlowgladApiKeyType } from '@/types'
import { getSession } from '@/utils/auth'
import core from '@/utils/core'
import { getCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { parseUnkeyMeta, unkey } from '@/utils/unkey'
import { adminTransaction } from './adminTransaction'
import db from './client'
import type { ApiKey } from './schema/apiKeys'
import { customers, customersSelectSchema } from './schema/customers'
import { memberships } from './schema/memberships'
import { users, usersSelectSchema } from './schema/users'
import { selectApiKeys } from './tableMethods/apiKeyMethods'
import { selectMembershipsAndUsersByMembershipWhere } from './tableMethods/membershipMethods'

type SessionUser = Session['user']

export interface JWTClaim extends JwtPayload {
  user_metadata: SessionUser
  app_metadata: SessionUser['app_metadata']
  email: string
  role: string
  organization_id: string
  auth_type: 'api_key' | 'webapp'
}

interface KeyVerifyResult {
  keyType: FlowgladApiKeyType
  userId: string
  ownerId: string
  environment: string
  metadata: ApiKey.ApiKeyMetadata
}

const userIdFromUnkeyMeta = (meta: ApiKey.ApiKeyMetadata) => {
  if (meta.type !== FlowgladApiKeyType.Secret) {
    throw new Error(
      `userIdFromUnkeyMeta: received invalid API key type`
    )
  }
  return meta.userId
}
/**
 * Returns the userId of the user associated with the key, or undefined if the key is invalid.
 * @param key
 * @returns
 */
async function keyVerify(key: string): Promise<KeyVerifyResult> {
  if (!core.IS_TEST) {
    const verificationResponse = await unkey().keys.verifyKey({
      key,
    })
    const result = verificationResponse.data
    if (!result) {
      throw new Error('No result for provided API key')
    }
    const meta = parseUnkeyMeta(result.meta)
    const ownerId = result.identity?.externalId
    if (!ownerId) {
      throw new Error(
        'No ownerId found in API key verification result'
      )
    }
    // Extract environment from key prefix (sk_live_ or sk_test_)
    const environment =
      (result.meta?.environment as string | undefined) ||
      (key.includes('_live_') ? 'live' : 'test')
    return {
      keyType: meta.type,
      userId: userIdFromUnkeyMeta(meta),
      ownerId,
      environment,
      metadata: meta,
    }
  }

  const txResult = await adminTransaction(async ({ transaction }) => {
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
    return Result.ok({
      membershipAndUser,
      organizationId: apiKeyRecord.organizationId,
      apiKeyType: apiKeyRecord.type,
      apiKeyLivemode: apiKeyRecord.livemode,
    })
  })
  const {
    membershipAndUser,
    organizationId,
    apiKeyType,
    apiKeyLivemode,
  } = txResult.unwrap()
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

/**
 * Creates authentication info for a Secret API key.
 *
 * Sets `auth_type: 'api_key'` in JWT claims, which allows API keys to bypass
 * the membership `focused` check in RLS policies. This is necessary because
 * API keys are scoped to a specific organization and should work regardless
 * of which organization the user has focused in the webapp.
 *
 * @param verifyKeyResult - The verified API key result containing:
 *   - `userId`: The user who created/owns the API key (extracted from metadata)
 *   - `ownerId`: The organization ID this API key belongs to
 * @returns Database authentication info with JWT claims set for API key auth
 */
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
    auth_type: 'api_key',
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

export const requestingCustomerAndUser = async ({
  betterAuthId,
  organizationId,
  customerId,
}: {
  betterAuthId: string
  organizationId: string
  customerId?: string
}) => {
  const whereConditions = [
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
    eq(customers.livemode, true),
  ]

  if (customerId) {
    whereConditions.push(eq(customers.id, customerId))
  }

  const result = await db
    .select({
      customer: customers,
      user: users,
    })
    .from(customers)
    .innerJoin(users, eq(customers.userId, users.id))
    .where(and(...whereConditions))
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
  customerId,
}: {
  betterAuthId: string
  organizationId: string
  customerId?: string
}): Promise<DatabaseAuthenticationInfo> => {
  const [result] = await requestingCustomerAndUser({
    betterAuthId,
    organizationId,
    customerId,
  })
  if (!result) {
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
      auth_type: 'webapp',
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
          customer_id: customer.id,
        },
      },
      app_metadata: { provider: 'customerBillingPortal' },
    },
  }
}

/**
 * Authenticates a webapp request for either merchant dashboard or customer billing portal.
 *
 * Determines the authentication context based on whether a customer organization ID
 * is present in the billing portal cookie state:
 * - If no customer organization ID: authenticates as merchant using focused membership
 * - If customer organization ID exists: authenticates as customer for billing portal
 *
 * Sets `auth_type: 'webapp'` in JWT claims, which means RLS policies will enforce
 * the membership `focused` check (unlike API key auth which bypasses it).
 *
 * @param user - The Better Auth user making the request
 * @param __testOnlyOrganizationId - Optional test organization ID override
 * @param customerId - Optional customer ID for customer billing portal authentication.
 *   When not provided, authenticates as the first customer found to enable RLS-based
 *   customer listing (customer role can see all customers with the same userId).
 * @returns Database authentication info with JWT claims and user context
 */
export async function databaseAuthenticationInfoForWebappRequest(
  user: User,
  __testOnlyOrganizationId?: string | undefined,
  customerId?: string
): Promise<DatabaseAuthenticationInfo> {
  const betterAuthId = user.id
  const customerOrganizationId =
    await getCustomerBillingPortalOrganizationId({
      __testOrganizationId: __testOnlyOrganizationId,
    })

  if (!customerOrganizationId) {
    // Merchant dashboard authentication flow
    // Explicitly require focused=true to match trpcContext.ts behavior.
    // This ensures both code paths return no organization when none is focused,
    // rather than arbitrarily selecting the first membership.
    const [focusedMembership] = await db
      .select()
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(users.betterAuthId, betterAuthId),
          eq(memberships.focused, true),
          isNull(memberships.deactivatedAt)
        )
      )
      .limit(1)
    const userId = focusedMembership?.memberships.userId
    const livemode = focusedMembership?.memberships.livemode ?? false
    const jwtClaim: JWTClaim = {
      role: 'merchant',
      sub: userId,
      email: user.email,
      auth_type: 'webapp',
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
      app_metadata: { provider: 'webapp' },
    }
    return {
      userId,
      livemode,
      jwtClaim,
    }
  }

  // Customer billing portal authentication flow
  return await dbInfoForCustomerBillingPortal({
    betterAuthId: user.id,
    organizationId: customerOrganizationId,
    customerId,
  })
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
  if (verifyKeyResult.keyType !== FlowgladApiKeyType.Secret) {
    throw new Error(
      `databaseAuthenticationInfoForApiKey: received invalid API key type: ${verifyKeyResult.keyType}`
    )
  }
  return dbAuthInfoForSecretApiKeyResult(verifyKeyResult)
}

export async function getDatabaseAuthenticationInfo(params: {
  apiKey: string | undefined
  __testOnlyOrganizationId?: string
  customerId?: string
}): Promise<DatabaseAuthenticationInfo> {
  const { apiKey, __testOnlyOrganizationId, customerId } = params
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
    __testOnlyOrganizationId,
    customerId
  )
}
