import { betterAuth } from 'better-auth'
import {
  flowgladPlugin,
  type FlowgladBetterAuthPluginOptions,
} from '@flowglad/better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/server/db/client'
import { betterAuthSchema } from '@/server/db/schema'

const betterAuthSecret = process.env.BETTER_AUTH_SECRET
if (!betterAuthSecret) {
  throw new Error('BETTER_AUTH_SECRET is not set')
}

const flowgladConfig: FlowgladBetterAuthPluginOptions = {
  customerType: 'user' as const,
  baseURL: 'http://localhost:3000',
  // apiKey optional - reads from FLOWGLAD_SECRET_KEY env var
  // baseURL optional - defaults to https://app.flowglad.com
}

const auth = betterAuth({
  // ... Better Auth config
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
  // @ts-expect-error - better-auth plugin type incompatibility with exactOptionalPropertyTypes
  plugins: [nextCookies(), flowgladPlugin(flowgladConfig)],
})

export { auth }
