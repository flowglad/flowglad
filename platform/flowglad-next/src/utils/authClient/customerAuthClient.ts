import {
  emailOTPClient,
  magicLinkClient,
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import core from '../core'

/**
 * Customer authentication client for client-side authentication.
 * This client is used for customer billing portal sign-in, sign-out, and session management.
 * Uses the /api/auth/customer base path to communicate with the customer auth instance.
 * Only supports OTP and magic link authentication (no password, no social login).
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
