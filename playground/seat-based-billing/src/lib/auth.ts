import {
  type FlowgladBetterAuthPluginOptions,
  flowgladPlugin,
} from '@flowglad/nextjs/better-auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { db } from '@/server/db/client'
import { betterAuthSchema } from '@/server/db/schema'

const betterAuthSecret = process.env.BETTER_AUTH_SECRET
if (!betterAuthSecret) {
  throw new Error('BETTER_AUTH_SECRET is not set')
}

const flowgladConfig: FlowgladBetterAuthPluginOptions = {
  customerType: 'organization' as const,
  // baseURL: 'http://localhost:3000',
  // customerType optional - defaults to user
  // apiKey optional - reads from FLOWGLAD_SECRET_KEY env var
  // baseURL optional - defaults to https://app.flowglad.com
}

const auth = betterAuth({
  // ... Better Auth config
  trustedOrigins: ['http://localhost:3001'],
  advanced: {
    // Use unique cookie prefix to avoid conflicts with platform on localhost
    cookiePrefix: 'pg-seat',
  },
  secret: betterAuthSecret,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: betterAuthSchema,
  }),
  plugins: [
    organization(), // Uncomment to test better auth plugin with organization flowglad customer
    flowgladPlugin(flowgladConfig),
  ],
})

export { auth }
