import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'
import core from '../core'

/**
 * Merchant auth client for merchant dashboard authentication.
 * Supports email/password, OAuth, and admin features.
 */
export const merchantAuthClient = createAuthClient({
  baseURL: core.NEXT_PUBLIC_APP_URL,
  basePath: '/api/auth/merchant',
  plugins: [emailOTPClient()],
})

export const {
  signIn: merchantSignIn,
  signOut: merchantSignOut,
  signUp: merchantSignUp,
  useSession: useMerchantSession,
} = merchantAuthClient
