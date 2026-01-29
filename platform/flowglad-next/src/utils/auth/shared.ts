import {
  account,
  session,
  user,
  verification,
} from '@db-core/schema/betterAuthSchema'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { customSession } from 'better-auth/plugins'
import { db } from '@/db/client'
import { betterAuthUserToApplicationUser } from '../authHelpers'

/**
 * Shared configuration for both merchant and customer auth instances.
 * This includes the database adapter, custom session handling, and user hooks.
 */
export const sharedAuthConfig = {
  database: drizzleAdapter(db, {
    provider: 'pg' as const,
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  plugins: [
    customSession(async ({ user, session }) => {
      return {
        focusedRole: [],
        user: {
          ...user,
        },
        session,
      }
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (betterAuthUser) => {
          await betterAuthUserToApplicationUser(betterAuthUser)
        },
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string' as const,
        required: false,
        defaultValue: 'merchant',
        input: false, // don't allow user to set role
      },
    },
  },
}
