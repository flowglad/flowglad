/**
 * Merchant auth instance for dashboard/merchant users.
 * Supports email/password, Google OAuth, and device authorization (CLI).
 * Admin plugin is merchant-only.
 */
import { betterAuth } from 'better-auth'
import {
  admin,
  bearer,
  customSession,
  deviceAuthorization,
} from 'better-auth/plugins'
import { headers } from 'next/headers'
import { sendForgotPasswordEmail } from '../email'
import {
  MERCHANT_AUTH_BASE_PATH,
  MERCHANT_COOKIE_PREFIX,
} from './constants'
import {
  defaultCookieAttributes,
  sharedDatabaseAdapter,
  sharedDatabaseHooks,
} from './shared'

export const merchantAuth = betterAuth({
  database: sharedDatabaseAdapter,
  basePath: MERCHANT_AUTH_BASE_PATH,
  advanced: {
    cookiePrefix: MERCHANT_COOKIE_PREFIX,
    defaultCookieAttributes,
  },
  plugins: [
    // Admin plugin is merchant-only
    admin(),
    // Bearer plugin enables authentication via Authorization: Bearer tokens
    // Required for CLI authentication where cookies aren't available
    bearer(),
    customSession(async ({ user, session }) => {
      return {
        focusedRole: [],
        user: {
          ...user,
        },
        session,
      }
    }),
    // Device Authorization plugin for CLI authentication via OAuth Device Flow (RFC 8628)
    // Note: verificationUri is NOT configurable - plugin hardcodes to /device
    // We handle this via a redirect page at /app/device/page.tsx -> /cli/authorize
    deviceAuthorization({
      expiresIn: '10m', // 10 minutes for code entry
      interval: '5s', // 5 second polling interval
      userCodeLength: 8, // 8 character user code
      deviceCodeLength: 40,
      validateClient: async (clientId) => clientId === 'flowglad-cli',
    }),
  ],
  databaseHooks: sharedDatabaseHooks,
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
  session: {
    expiresIn: 60 * 60 * 24 * 90, // 90 days in seconds (better-auth default)
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    additionalFields: {
      scope: {
        type: 'string',
        required: true,
        defaultValue: 'merchant',
        input: false, // server-only
      },
      contextOrganizationId: {
        type: 'string',
        required: false,
        defaultValue: undefined,
        input: false, // don't allow user to set contextOrganizationId
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
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

/**
 * Get the current merchant session from cookies.
 * Returns null if no valid merchant session exists.
 */
export const getMerchantSession = async () => {
  const session = await merchantAuth.api.getSession({
    headers: await headers(),
  })
  return session
}
