import { FlowgladApiKeyType } from '@db-core/enums'
import type { ApiKey } from '@db-core/schema/apiKeys'
import {
  customers,
  customersSelectSchema,
} from '@db-core/schema/customers'
import { memberships } from '@db-core/schema/memberships'
import { pricingModels } from '@db-core/schema/pricingModels'
import { users, usersSelectSchema } from '@db-core/schema/users'
import type { Session } from '@supabase/supabase-js'
import type { User } from 'better-auth'
import { Result } from 'better-result'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import type { JwtPayload } from 'jsonwebtoken'
import { z } from 'zod'
import { getCustomerSession, getSession } from '@/utils/auth'
import core from '@/utils/core'
import { parseUnkeyMeta, unkey } from '@/utils/unkey'
import { adminTransaction } from './adminTransaction'
import db from './client'
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
  /**
   * Pricing model ID for PM-scoped access.
   * Set for both auth types:
   * - API key auth: extracted from Unkey metadata (required).
   * - Webapp auth: derived from the user's focusedPricingModelId on their membership.
   * Used by the restrictive RLS policy in migration 0287_lovely_anita_blake.sql
   * via the current_pricing_model_id() SQL function.
   */
  pricing_model_id?: string
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
  if (!core.IS_TEST && !core.IS_LOCAL_PLAYGROUND) {
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

  const {
    membershipAndUser,
    organizationId,
    apiKeyType,
    apiKeyLivemode,
    pricingModelId,
  } = (
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
      return Result.ok({
        membershipAndUser,
        organizationId: apiKeyRecord.organizationId,
        apiKeyType: apiKeyRecord.type,
        apiKeyLivemode: apiKeyRecord.livemode,
        pricingModelId: apiKeyRecord.pricingModelId,
      })
    })
  ).unwrap()
  return {
    keyType: apiKeyType,
    userId: membershipAndUser.user.id,
    ownerId: organizationId,
    environment: apiKeyLivemode ? 'live' : 'test',
    metadata: {
      type: apiKeyType as FlowgladApiKeyType.Secret,
      userId: membershipAndUser.user.id,
      organizationId: organizationId,
      pricingModelId: pricingModelId,
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
 * Also extracts `pricingModelId` from the API key metadata and includes it
 * in JWT claims as `pricing_model_id`. This enables RLS policies to enforce
 * pricing model isolation for API key requests.
 *
 * @param verifyKeyResult - The verified API key result containing:
 *   - `userId`: The user who created/owns the API key (extracted from metadata)
 *   - `ownerId`: The organization ID this API key belongs to
 *   - `metadata`: Contains `pricingModelId` for PM-scoped access
 * @returns Database authentication info with JWT claims set for API key auth
 * @throws Error if `pricingModelId` is missing from API key metadata
 */
export async function dbAuthInfoForSecretApiKeyResult(
  verifyKeyResult: KeyVerifyResult
): Promise<DatabaseAuthenticationInfo> {
  if (verifyKeyResult.keyType !== FlowgladApiKeyType.Secret) {
    throw new Error(
      `dbAuthInfoForSecretApiKey: received invalid API key type: ${verifyKeyResult.keyType}`
    )
  }

  // Extract pricingModelId from API key metadata - required for PM-scoped access
  const pricingModelId = verifyKeyResult.metadata.pricingModelId
  if (!pricingModelId) {
    throw new Error(
      'API key is missing pricingModelId in metadata. This key may not have been migrated. ' +
        'Please contact support or create a new API key.'
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
    pricing_model_id: pricingModelId,
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
 * Authenticates a webapp request for merchant dashboard.
 *
 * Sets `auth_type: 'webapp'` in JWT claims, which means RLS policies will enforce
 * the membership `focused` check (unlike API key auth which bypasses it).
 *
 * Note: For customer billing portal authentication, use the explicit `authScope: 'customer'`
 * parameter in getDatabaseAuthenticationInfo, which bypasses this function entirely.
 *
 * @param user - The Better Auth user making the request
 * @returns Database authentication info with JWT claims and user context
 */
export async function databaseAuthenticationInfoForWebappRequest(
  user: User
): Promise<DatabaseAuthenticationInfo> {
  const betterAuthId = user.id

  // Merchant dashboard authentication flow
  // Join with pricingModels to derive livemode from the focused pricing model
  // and set pricing_model_id in JWT claims for RLS scoping.
  // Explicitly require focused=true to match trpcContext.ts behavior.
  // This ensures both code paths return no organization when none is focused,
  // rather than arbitrarily selecting the first membership.
  const [focusedMembership] = await db
    .select({
      membership: memberships,
      user: users,
      pricingModel: pricingModels,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(
      pricingModels,
      eq(memberships.focusedPricingModelId, pricingModels.id)
    )
    .where(
      and(
        eq(users.betterAuthId, betterAuthId),
        eq(memberships.focused, true),
        isNull(memberships.deactivatedAt)
      )
    )
    .limit(1)
  const userId = focusedMembership?.membership.userId
  // Derive livemode from the focused pricing model, not the membership
  const livemode = focusedMembership?.pricingModel.livemode ?? false
  const pricingModelId = focusedMembership?.pricingModel.id
  const jwtClaim: JWTClaim = {
    role: 'merchant',
    sub: userId,
    email: user.email,
    auth_type: 'webapp',
    // Set pricing_model_id for RLS PM scoping (same as API key auth)
    pricing_model_id: pricingModelId,
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
      focusedMembership?.membership.organizationId ?? '',
    app_metadata: { provider: 'webapp' },
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
  authScope?: 'merchant' | 'customer'
}): Promise<DatabaseAuthenticationInfo> {
  const { apiKey, __testOnlyOrganizationId, customerId, authScope } =
    params
  if (apiKey) {
    const verifyKeyResult = await keyVerify(apiKey)
    return await databaseAuthenticationInfoForApiKeyResult(
      verifyKeyResult
    )
  }

  // If authScope is explicitly 'customer', use customer session directly
  // This handles the dual-session case where both merchant and customer sessions exist
  if (authScope === 'customer') {
    const customerSession = await getCustomerSession()
    if (customerSession) {
      // Customer session - use the customer billing portal flow
      // Get organizationId from customer session's contextOrganizationId
      const customerOrganizationId = (
        customerSession.session as
          | { contextOrganizationId?: string }
          | undefined
      )?.contextOrganizationId

      if (!customerOrganizationId) {
        throw new Error(
          'Customer session missing contextOrganizationId for authenticated transaction'
        )
      }

      return await dbInfoForCustomerBillingPortal({
        betterAuthId: customerSession.user.id,
        organizationId: customerOrganizationId,
        customerId,
      })
    }
    throw new Error(
      'No customer session found for customer-scoped transaction'
    )
  }

  // Default behavior: try merchant session first (backward compatibility)
  const merchantSession = await getSession()
  if (merchantSession) {
    return await databaseAuthenticationInfoForWebappRequest(
      merchantSession.user as User
    )
  }

  // If no merchant session, try customer session for billing portal
  const customerSession = await getCustomerSession()
  if (customerSession) {
    // Customer session - use the customer billing portal flow
    // Get organizationId from customer session's contextOrganizationId
    const customerOrganizationId = (
      customerSession.session as
        | { contextOrganizationId?: string }
        | undefined
    )?.contextOrganizationId

    if (!customerOrganizationId) {
      throw new Error(
        'Customer session missing contextOrganizationId for authenticated transaction'
      )
    }

    return await dbInfoForCustomerBillingPortal({
      betterAuthId: customerSession.user.id,
      organizationId: customerOrganizationId,
      customerId,
    })
  }

  throw new Error('No user found for a non-API key transaction')
}
