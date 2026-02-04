/**
 * Merchant auth client for dashboard/merchant users.
 * Supports email/password, Google OAuth, and device authorization (CLI).
 */
import { deviceAuthorizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { MERCHANT_AUTH_BASE_PATH } from '../auth/constants'
import core from '../core'

export const merchantAuthClient = createAuthClient({
  baseURL: core.NEXT_PUBLIC_APP_URL,
  basePath: MERCHANT_AUTH_BASE_PATH,
  plugins: [deviceAuthorizationClient()],
})

export const {
  signIn: merchantSignIn,
  signOut: merchantSignOut,
  signUp: merchantSignUp,
  useSession: useMerchantSession,
} = merchantAuthClient
