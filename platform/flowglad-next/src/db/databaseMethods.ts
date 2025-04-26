import {
  AdminTransactionParams,
  AuthenticatedTransactionParams,
} from '@/db/types'
import { Unkey, verifyKey } from '@unkey/api'
import db from './client'
import { and, eq, or, sql } from 'drizzle-orm'
import { type Session } from '@supabase/supabase-js'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import core, { error, isNil } from '@/utils/core'
import { memberships } from './schema/memberships'
import { stackServerApp } from '@/stack'
import { users } from './schema/users'
import { selectApiKeys } from './tableMethods/apiKeyMethods'
import { selectMembershipsAndUsersByMembershipWhere } from './tableMethods/membershipMethods'
import { organizations } from './schema/organizations'
import { ServerUser } from '@stackframe/stack'
import { FlowgladApiKeyType } from '@/types'

type SessionUser = Session['user']

export interface JWTClaim extends JwtPayload {
  user_metadata: SessionUser
  app_metadata: SessionUser['app_metadata']
  email: string
  role: string
}

const backwardsCompatibleKeyTypeFromUnkeyApiKeyResult = (
  result: Awaited<ReturnType<typeof verifyKey>>['result']
): FlowgladApiKeyType => {
  if (!result) {
    throw new Error('No result from unkey verifyKey')
  }
  if (result.meta?.keyType) {
    return result.meta.keyType as FlowgladApiKeyType
  }
  return FlowgladApiKeyType.Secret
}

/**
 * Returns the userId of the user associated with the key, or undefined if the key is invalid.
 * @param key
 * @returns
 */
const keyVerify = async (
  key: string
): Promise<{
  keyType: FlowgladApiKeyType
  userId: string
  ownerId: string
  environment: string
}> => {
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
    return {
      keyType:
        backwardsCompatibleKeyTypeFromUnkeyApiKeyResult(result),
      userId: result.meta!.userId as string,
      ownerId: result.ownerId as string,
      environment: result.environment as string,
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
  }
}

const databaseAuthenticationInfoForSecretApikey =
  async (verifyKeyResult: {
    userId: string
    ownerId: string
    environment: string
  }) => {
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

const databaseAuthenticationInfoForWebappRequest = async (
  user: ServerUser
) => {
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

export const authenticatedTransaction = async <T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  {
    apiKey,
  }: {
    apiKey?: string
  } = {}
) => {
  let userId: string | undefined
  let jwtClaim: JWTClaim | null = null
  let livemode: boolean = true

  if (!apiKey) {
    const user = await stackServerApp.getUser()
    if (!user) {
      throw new Error('No user found for a non-API key transaction')
    }
    const authenticationInfo =
      await databaseAuthenticationInfoForWebappRequest(user)
    userId = authenticationInfo.userId
    livemode = authenticationInfo.livemode
    jwtClaim = authenticationInfo.jwtClaim
  }

  if (apiKey) {
    const result = await keyVerify(apiKey)
    if (!result.userId) {
      throw new Error('Invalid API key,')
    }
    if (!result.ownerId) {
      throw new Error('Invalid API key, no ownerId')
    }
    const authenticationInfo =
      await databaseAuthenticationInfoForSecretApikey(result)
    userId = authenticationInfo.userId
    livemode = authenticationInfo.livemode
    jwtClaim = authenticationInfo.jwtClaim
  }

  return db.transaction(async (transaction) => {
    if (!jwtClaim) {
      throw new Error('No jwtClaim found')
    }
    if (!userId) {
      throw new Error('No userId found')
    }
    /**
     * Clear whatever state may have been set by previous uses of the connection.
     * This shouldn't be a concern, but we've seen some issues where connections keep
     * state between transactions.
     */
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', '${sql.raw(
        JSON.stringify(jwtClaim)
      )}', TRUE)`
    )
    await transaction.execute(
      sql`set role '${sql.raw(jwtClaim.role)}'`
    )
    await transaction.execute(
      sql`SELECT set_config('app.livemode', '${sql.raw(
        Boolean(livemode).toString()
      )}', TRUE);`
    )
    const resp = await fn({ transaction, userId, livemode })
    /**
     * Reseting the role and request.jwt.claims here,
     * becuase the auth state seems to be returned to the client "dirty",
     * with the role from the previous session still applied.
     */
    await transaction.execute(sql`RESET ROLE;`)

    return resp
  })
}

/**
 * Useful for safely executing code on behalf of a user, i.e. their workflows.
 * @param impersonatedUserId
 * @param fn
 * @returns
 */
export const impersonatedTransaction = async <T>(
  impersonatedUserId: string,
  fn: (params: AuthenticatedTransactionParams) => Promise<T>
) => {
  // Create a mock JWT claim that mimics a real user session
  const mockJwtClaim = {
    role: 'authenticated',
    sub: impersonatedUserId,
    email: 'impersonated@example.com', // dummy email
    session_id: `mock_session_${Date.now()}`,
    user_metadata: {
      id: impersonatedUserId,
    },
    app_metadata: {
      provider: 'email',
    },
  }

  return db.transaction(async (transaction) => {
    // Clear previous state
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )
    // Set the impersonated user's claims
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', '${sql.raw(
        JSON.stringify(mockJwtClaim)
      )}', TRUE)`
    )
    await transaction.execute(sql`set role 'authenticated'`)

    const resp = await fn({
      transaction,
      userId: impersonatedUserId,
      livemode: true,
    })

    // Reset state
    await transaction.execute(sql`RESET ROLE;`)

    return resp
  })
}

export const adminTransaction = async <T>(
  fn: (params: AdminTransactionParams) => Promise<T>,
  {
    livemode = true,
  }: {
    livemode?: boolean
  } = {}
) => {
  return db.transaction(async (transaction) => {
    /**
     * Reseting the role and request.jwt.claims here,
     * becuase the auth state seems to be returned to the client "dirty",
     * with the role from the previous session still applied.
     */
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', NULL, true);`
    )

    const resp = await fn({
      transaction,
      userId: 'ADMIN',
      livemode: isNil(livemode) ? true : livemode,
    })
    await transaction.execute(sql`RESET ROLE;`)
    return resp
  })
}
