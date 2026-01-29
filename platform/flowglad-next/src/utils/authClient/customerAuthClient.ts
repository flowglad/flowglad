import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, magicLinkClient } from 'better-auth/client/plugins'
import core from '../core'

/**
 * Customer auth client for billing portal authentication.
 * Only supports OTP and magic link authentication (no password/OAuth).
 */
export const customerAuthClient = createAuthClient({
  baseURL: core.NEXT_PUBLIC_APP_URL,
  basePath: '/api/auth/customer',
  plugins: [emailOTPClient(), magicLinkClient()],
})

export const {
  signIn: customerSignIn,
  signOut: customerSignOut,
  useSession: useCustomerSession,
} = customerAuthClient
