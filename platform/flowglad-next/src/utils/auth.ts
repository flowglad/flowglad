import { betterAuth } from 'better-auth'
import { admin, customSession } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db/client'
import {
  user,
  session,
  account,
  verification,
} from '@/db/schema/betterAuthSchema'
import { betterAuthUserToApplicationUser } from './authHelpers'
import { createAuthMiddleware, APIError } from "better-auth/api";

import { sendForgotPasswordEmail } from './email'
import { headers } from 'next/headers'
import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  plugins: [admin(),         customSession(async ({ user, session }) => {
    return {
        focusedRole: [],
        user: {
            ...user,
        },
        session
    };
}),
],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!ctx.body.callbackURL.startsWith('/billing/')) {
        return ctx
      }
      if (ctx.body.callbackURL.startsWith('/billing/')) {
        const [maybeCustomer] = await adminTransaction(async ({ transaction }) => {
          return selectCustomers({
            email: ctx.body.user.email,
            organizationId: ctx.body.callbackURL.split('/')[2],
          }, transaction)
        })
        /**
         * TODO: quiet throw and just return the ctx
         */
        if (!maybeCustomer) {
          throw new APIError('BAD_REQUEST')
        }
        if (maybeCustomer) {
          // TODO: also check if the customer is already a user
          // also check if they're already a merchant
          return {
            ...ctx,
            body: {
              ...ctx.body,
              context: {
                ...ctx.body.context,
                role: 'customer',
              },
            },
          }
        }
        return {
          ...ctx,
          body: {
            ...ctx.body,
            context: {
              ...ctx.body.context,
              role: 'merchant',
            },
          },
        }
      }
      return ctx
    }),
  },
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
        type: 'string',
        required: false,
        defaultValue: 'merchant',
        input: false, // don't allow user to set role
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      await sendForgotPasswordEmail({
        to: [user.email],
        url,
      })
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
})

export const getSession = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  
  return session
}
