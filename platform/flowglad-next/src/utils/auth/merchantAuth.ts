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
        type: 'string' as const,
        required: true,
        defaultValue: 'merchant',
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
    // OTP plugin - not implemented for merchants yet
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        throw new Error('Merchant OTP emails not implemented')
      },
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 3,
    }),
    // Magic link plugin - not implemented for merchants yet
    magicLink({
      async sendMagicLink({ email, url, token }) {
        throw new Error('Merchant magic link not implemented')
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

export const getMerchantSession = async () => {
  const session = await merchantAuth.api.getSession({
    headers: await headers(),
  })

  return session
}
