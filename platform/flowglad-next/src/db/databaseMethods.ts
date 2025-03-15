import {
  AdminTransactionParams,
  AuthenticatedTransactionParams,
} from '@/db/types'
import { verifyKey } from '@unkey/api'
import { auth } from '@clerk/nextjs/server'
import db from './client'
import { and, eq, sql } from 'drizzle-orm'
import { type Session } from '@supabase/supabase-js'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import core, { isNil } from '@/utils/core'
import { memberships } from './schema/memberships'

type SessionUser = Session['user']

export interface JWTClaim extends JwtPayload {
  user_metadata: SessionUser
  app_metadata: SessionUser['app_metadata']
  email: string
  session_id: string
  role: string
}

export const authenticatedTransaction = async <T>(
  fn: (params: AuthenticatedTransactionParams) => Promise<T>,
  {
    apiKey,
  }: {
    apiKey?: string
  } = {}
) => {
  let jwtClaim: JWTClaim | null = null
  let userId: string | null = null
  let livemode: boolean = true

  if (!apiKey) {
    const { userId: clerkUserId, getToken } = auth()
    userId = clerkUserId
    if (!userId) {
      throw new Error('No userId found for a non-API key transaction')
    }
    const accessToken = await getToken({
      template: 'supabase',
    })
    if (!accessToken) {
      throw new Error(`No access token for user ${userId}`)
    }
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
    livemode = focusedMembership?.livemode ?? false
    jwtClaim = jwt.verify(
      accessToken,
      core.envVariable('SUPABASE_JWT_SECRET')
    ) as JWTClaim
  }

  if (apiKey) {
    const { result, error } = await verifyKey({
      key: apiKey,
      apiId: core.envVariable('UNKEY_API_ID'),
    })
    if (error) {
      throw error
    }
    if (!result) {
      throw new Error('No result')
    }
    const membershipsForOrganization = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, result.ownerId!),
          eq(memberships.userId, `${result.meta?.userId}`)
        )
      )
    userId =
      membershipsForOrganization[0].userId ?? `${result.meta?.userId}`
    livemode = result.environment === 'live'
    jwtClaim = {
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
