/**
 * Shared auth configuration for both merchant and customer auth instances.
 * Contains common settings, hooks, and database adapter configuration.
 */
import {
  account,
  deviceCode,
  session,
  user,
  verification,
} from '@db-core/schema/betterAuthSchema'
import type { User } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db/client'
import { betterAuthUserToApplicationUser } from '../authHelpers'

/**
 * Shared database adapter used by both merchant and customer auth instances.
 */
export const sharedDatabaseAdapter = drizzleAdapter(db, {
  provider: 'pg',
  schema: {
    user,
    session,
    account,
    verification,
    deviceCode,
  },
})

/**
 * Shared database hooks for user creation.
 * Both merchant and customer auth instances use the same user table,
 * so the same hooks apply.
 */
export const sharedDatabaseHooks = {
  user: {
    create: {
      after: async (betterAuthUser: User) => {
        await betterAuthUserToApplicationUser(betterAuthUser)
      },
    },
  },
}

/**
 * Default cookie attributes for security.
 * Used by both merchant and customer auth instances.
 */
export const defaultCookieAttributes = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
}

/**
 * Session scope type for dual-scope auth.
 */
export type SessionScope = 'merchant' | 'customer'

/**
 * Extract session scope from a better-auth session object.
 * Returns undefined if scope is not set (backward compatibility) or invalid.
 */
export const getSessionScope = (
  session: { session?: unknown } | null | undefined
): SessionScope | undefined => {
  const scope = (session?.session as { scope?: unknown } | undefined)
    ?.scope
  if (scope === 'merchant' || scope === 'customer') {
    return scope
  }
  return undefined
}

/**
 * Extract contextOrganizationId from a customer session.
 * Returns undefined if not set or not a valid string.
 */
export const getSessionContextOrgId = (
  session: { session?: unknown } | null | undefined
): string | undefined => {
  const orgId = (
    session?.session as
      | { contextOrganizationId?: unknown }
      | undefined
  )?.contextOrganizationId
  if (typeof orgId === 'string' && orgId.length > 0) {
    return orgId
  }
  return undefined
}
