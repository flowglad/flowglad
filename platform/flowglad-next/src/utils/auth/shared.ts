import {
  account,
  session,
  user,
  verification,
} from '@db-core/schema/betterAuthSchema'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db/client'
import { betterAuthUserToApplicationUser } from '../authHelpers'

// Shared auth configuration used by both merchantAuth and customerAuth
export const sharedAuthConfig = {
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
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
} as const
