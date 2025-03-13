import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import core from './core'
import db from '@/db/client'

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    async sendResetPassword(data, request) {
      // Send an email to the user with a link to reset their password
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg', // or "pg" or "mysql"
  }),

  /** if no database is provided, the user data will be stored in memory.
   * Make sure to provide a database to persist user data **/
})
