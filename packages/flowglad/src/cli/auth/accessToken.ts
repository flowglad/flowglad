/**
 * Access token management for CLI session Unkey API keys.
 * These tokens are short-lived (10 minutes) and scoped to a specific
 * organization and pricing model.
 */

export interface AccessTokenRequest {
  organizationId: string
  pricingModelId: string
  livemode: boolean
}

export interface AccessTokenResponse {
  accessToken: string
  expiresAt: string // ISO date
}

export interface StoredCredentials {
  // Refresh token (Better Auth session) - user identity
  refreshToken: string
  refreshTokenExpiresAt: string // ISO date (~90 days from login)
  userId: string
  email: string
  name?: string

  // Access token (Unkey API key) - scoped to org + PM
  // These are populated after `flowglad link`
  accessToken?: string
  accessTokenExpiresAt?: string // ISO date (10 minutes from creation)
  organizationId?: string
  organizationName?: string
  pricingModelId?: string
  pricingModelName?: string
  livemode?: boolean
}

/**
 * Request a new access token (short-lived Unkey API key) from the server.
 *
 * @param baseUrl - The base URL of the Flowglad API (e.g., https://api.flowglad.com)
 * @param refreshToken - The Better Auth session token (refresh token)
 * @param request - The access token request parameters
 * @returns The access token response with token and expiry
 * @throws Error if the request fails
 */
export const requestAccessToken = async (
  baseUrl: string,
  refreshToken: string,
  request: AccessTokenRequest
): Promise<AccessTokenResponse> => {
  const response = await fetch(`${baseUrl}/api/cli/access-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMessage =
      errorData.message ||
      errorData.error ||
      `HTTP ${response.status}`
    throw new Error(`Failed to get access token: ${errorMessage}`)
  }

  return response.json()
}

/**
 * Check if an access token is expired or will expire within the buffer period.
 *
 * @param expiresAt - ISO date string of when the token expires
 * @param bufferSeconds - Buffer time in seconds before expiry to consider expired (default: 30)
 * @returns true if the token is expired or will expire within the buffer period
 */
export const isAccessTokenExpired = (
  expiresAt: string,
  bufferSeconds: number = 30
): boolean => {
  const expiresAtDate = new Date(expiresAt)
  const now = new Date()
  const bufferMs = bufferSeconds * 1000

  return expiresAtDate.getTime() - now.getTime() <= bufferMs
}

/**
 * Ensure a valid access token is available, refreshing if necessary.
 *
 * This function checks if the stored access token is still valid. If it's
 * expired or about to expire (within 30 seconds), it requests a new one.
 *
 * @param baseUrl - The base URL of the Flowglad API
 * @param credentials - The stored credentials containing refresh token and access token info
 * @param saveCredentials - Callback to save updated credentials
 * @returns The valid access token
 * @throws Error if no org/PM is linked or if token refresh fails
 */
export const ensureValidAccessToken = async (
  baseUrl: string,
  credentials: StoredCredentials,
  saveCredentials: (creds: StoredCredentials) => Promise<void>
): Promise<string> => {
  // Check if we have the required linking info
  if (
    !credentials.organizationId ||
    !credentials.pricingModelId ||
    credentials.livemode === undefined
  ) {
    throw new Error(
      'No organization or pricing model linked. Run `flowglad link` first.'
    )
  }

  // If we have a valid access token, return it
  if (
    credentials.accessToken &&
    credentials.accessTokenExpiresAt &&
    !isAccessTokenExpired(credentials.accessTokenExpiresAt)
  ) {
    return credentials.accessToken
  }

  // Request a new access token
  const response = await requestAccessToken(
    baseUrl,
    credentials.refreshToken,
    {
      organizationId: credentials.organizationId,
      pricingModelId: credentials.pricingModelId,
      livemode: credentials.livemode,
    }
  )

  // Update credentials with new access token
  const updatedCredentials: StoredCredentials = {
    ...credentials,
    accessToken: response.accessToken,
    accessTokenExpiresAt: response.expiresAt,
  }

  await saveCredentials(updatedCredentials)

  return response.accessToken
}
