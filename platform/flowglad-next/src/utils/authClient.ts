import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import core from './core'

export const authClient = createAuthClient({
  baseURL: core.NEXT_PUBLIC_APP_URL,
  plugins: [emailOTPClient()],
})

export const { signIn, signOut, signUp, useSession } = authClient
