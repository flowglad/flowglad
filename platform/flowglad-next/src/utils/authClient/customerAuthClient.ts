/**
 * Customer auth client for billing portal users.
 * Supports OTP and magic link only - no password or social login.
 */
import {
  emailOTPClient,
  magicLinkClient,
} from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { CUSTOMER_AUTH_BASE_PATH } from '../auth/constants'
import core from '../core'

export const customerAuthClient = createAuthClient({
  baseURL: core.NEXT_PUBLIC_APP_URL,
  basePath: CUSTOMER_AUTH_BASE_PATH,
  plugins: [emailOTPClient(), magicLinkClient()],
})

export const {
  signIn: customerSignIn,
  signOut: customerSignOut,
  useSession: useCustomerSession,
} = customerAuthClient
