import { createAuthClient } from 'better-auth/react'

export const { signIn, signUp, useSession } = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL, // the base url of your auth server
})
