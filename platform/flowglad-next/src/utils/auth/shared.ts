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
