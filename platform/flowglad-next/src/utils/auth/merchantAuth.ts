import { betterAuth } from 'better-auth'
import {
  admin,
  customSession,
  emailOTP,
  magicLink,
} from 'better-auth/plugins'
import { headers } from 'next/headers'
import { sendForgotPasswordEmail } from '../email'
import { MERCHANT_COOKIE_PREFIX } from './constants'
import { sharedAuthConfig } from './shared'

/**
 * Merchant authentication instance.
 * This instance is used for merchant dashboard authentication and includes:
 * - Full authentication stack (password, OAuth, etc.)
 * - Admin plugin for merchant-only admin actions
 * - Email & password authentication
 * - Google OAuth
 * - Magic link and OTP support
 * - Merchant-scoped sessions with default better-auth expiry
 */
export const merchantAuth = betterAuth({
  ...sharedAuthConfig,
  advanced: {
    cookiePrefix: MERCHANT_COOKIE_PREFIX,
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  },
  basePath: '/api/auth/merchant',
  session: {
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
        input: false, // server-only
      },
    },
  },
  plugins: [
    admin(),
    customSession(async ({ user, session }) => {
      return {
        focusedRole: [],
        user: {
          ...user,
        },
        session,
      }
    }),
    // OTP plugin - primary authentication method for merchants
    // Configured with 6-digit OTP, 10-minute expiry, and 3 allowed attempts
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        // For merchant emails (not implemented yet)
        throw new Error('Merchant OTP emails not implemented')
      },
      otpLength: 6, // 6-digit OTP code
      expiresIn: 600, // 10 minutes in seconds (600 seconds)
      allowedAttempts: 3, // Maximum 3 attempts before OTP becomes invalid
    }),
    // Magic link plugin - fallback authentication method
    magicLink({
      async sendMagicLink({ email, url, token }) {
        // For merchant emails (not implemented yet)
        throw new Error('Merchant magic link emails not implemented')
      },
    }),
  ],
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

/**
 * Get the current merchant session.
 * Returns null if no merchant session exists or if the session is not a merchant session.
 */
export const getMerchantSession = async () => {
  const session = await merchantAuth.api.getSession({
    headers: await headers(),
  })

  return session
}
