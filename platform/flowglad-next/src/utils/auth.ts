import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/db/client'
import {
  insertUser,
  selectUsers,
  updateUser,
} from '@/db/tableMethods/userMethods'
import { adminTransaction } from '@/db/adminTransaction'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await adminTransaction(async ({ transaction }) => {
            const [existingUser] = await selectUsers(
              {
                email: user.email,
              },
              transaction
            )
            if (existingUser) {
              await updateUser(
                {
                  id: existingUser.id,
                  betterAuthId: user.id,
                },
                transaction
              )
            } else {
              await insertUser(
                {
                  email: user.email,
                  name: user.name ?? null,
                  id: user.id,
                  betterAuthId: user.id,
                  stackAuthId: null,
                },
                transaction
              )
            }
          })
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
})
