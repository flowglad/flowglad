import type { CAC } from 'cac'
import { clearCredentials, loadCredentials } from '../auth/config'

/**
 * Returns the API base URL for Flowglad.
 * Can be overridden with FLOWGLAD_API_URL environment variable (used for testing/development).
 */
const getApiUrl = (): string => {
  return process.env.FLOWGLAD_API_URL ?? 'https://flowglad.com'
}

/**
 * Signs out from Better Auth by invalidating the session server-side.
 * Makes a POST request to /api/auth/sign-out with the session token.
 *
 * @param refreshToken - The Better Auth session token to invalidate
 * @returns true if sign-out was successful, false otherwise
 */
const signOutFromServer = async (
  refreshToken: string
): Promise<boolean> => {
  const baseUrl = getApiUrl()
  const url = new URL('/api/auth/sign-out', baseUrl)

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        'Content-Type': 'application/json',
      },
    })

    // Better Auth sign-out returns 200 on success
    return response.ok
  } catch {
    // Network errors - still clear local credentials
    return false
  }
}

/**
 * Performs the logout flow:
 * 1. Loads credentials from ~/.flowglad/credentials.json
 * 2. If logged in, calls Better Auth sign-out endpoint to invalidate session
 * 3. Clears local credentials file
 */
export const logoutFlow = async (): Promise<void> => {
  const credentials = await loadCredentials()

  if (!credentials) {
    console.log('You are not logged in.')
    return
  }

  // Attempt to invalidate session server-side
  const signedOut = await signOutFromServer(credentials.refreshToken)

  // Clear local credentials regardless of server response
  await clearCredentials()

  if (signedOut) {
    console.log(
      `Logged out successfully. Goodbye, ${credentials.name ?? credentials.email}!`
    )
  } else {
    // Server sign-out failed (network error or already expired), but local credentials cleared
    console.log(
      'Logged out locally. (Server session may have already expired)'
    )
  }
}

/**
 * Registers the logout command with the CLI.
 */
export const registerLogoutCommand = (cli: CAC): void => {
  cli
    .command('logout', 'Clear stored credentials')
    .action(async () => {
      await logoutFlow()
    })
}
