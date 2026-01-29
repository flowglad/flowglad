import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import core from '../core'

/**
 * Merchant authentication client for client-side authentication.
 * This client is used for merchant dashboard sign-in, sign-out, and session management.
 * Uses the /api/auth/merchant base path to communicate with the merchant auth instance.
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
