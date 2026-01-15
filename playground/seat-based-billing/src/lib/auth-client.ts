'use client'

import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  // Default to relative origin; allows prod/staging to work without hard-coded localhost
  baseURL: process.env.NEXT_PUBLIC_BASE_URL ?? '',
  plugins: [organizationClient()], // Uncomment to test better auth plugin with organization flowglad customer
})
