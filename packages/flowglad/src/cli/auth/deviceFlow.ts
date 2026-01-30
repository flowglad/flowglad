/**
 * Device Authorization Flow implementation for CLI authentication.
 * Implements RFC 8628 OAuth 2.0 Device Authorization Grant via Better Auth endpoints.
 */

/**
 * Response from POST /api/auth/device/code
 */
export interface DeviceCodeResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

/**
 * OAuth2 token response from Better Auth device.token() endpoint.
 * The access_token here is actually the REFRESH TOKEN (Better Auth session token).
 */
export interface DeviceTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

/**
 * Session response from Better Auth getSession() endpoint.
 */
export interface SessionResponse {
  user: { id: string; email: string; name: string }
  session: { id: string; expiresAt: string }
}

/**
 * Error codes returned by the device token endpoint during polling.
 */
export type DeviceFlowError =
  | 'authorization_pending'
  | 'slow_down'
  | 'expired_token'
  | 'access_denied'

export class DeviceFlowAuthorizationPendingError extends Error {
  constructor() {
    super('Authorization pending - user has not yet authorized')
    this.name = 'DeviceFlowAuthorizationPendingError'
  }
}

export class DeviceFlowSlowDownError extends Error {
  constructor() {
    super('Slow down - polling too frequently')
    this.name = 'DeviceFlowSlowDownError'
  }
}

export class DeviceFlowExpiredTokenError extends Error {
  constructor() {
    super('Device code has expired')
    this.name = 'DeviceFlowExpiredTokenError'
  }
}

export class DeviceFlowAccessDeniedError extends Error {
  constructor() {
    super('User denied access')
    this.name = 'DeviceFlowAccessDeniedError'
  }
}

const CLIENT_ID = 'flowglad-cli'

/**
 * Waits for the specified number of milliseconds.
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Requests a device code from the Better Auth device authorization endpoint.
 *
 * @param baseUrl - The base URL of the Flowglad API (e.g., "https://flowglad.com")
 * @returns Device code response with verification URI and user code
 */
export const requestDeviceCode = async (
  baseUrl: string
): Promise<DeviceCodeResponse> => {
  const url = new URL('/api/auth/device/code', baseUrl)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Failed to request device code: ${response.status} ${errorText}`
    )
  }

  const data = await response.json()

  // Better Auth returns snake_case, we convert to camelCase
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: data.expires_in,
    interval: data.interval,
  }
}

/**
 * Polls for token from the device token endpoint.
 * Single poll attempt - does not loop.
 */
const pollTokenOnce = async (
  baseUrl: string,
  deviceCode: string
): Promise<DeviceTokenResponse> => {
  const url = new URL('/api/auth/device/token', baseUrl)

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
    }),
  })

  const data = await response.json()

  // Check for OAuth2 error responses
  if (data.error) {
    switch (data.error as DeviceFlowError) {
      case 'authorization_pending':
        throw new DeviceFlowAuthorizationPendingError()
      case 'slow_down':
        throw new DeviceFlowSlowDownError()
      case 'expired_token':
        throw new DeviceFlowExpiredTokenError()
      case 'access_denied':
        throw new DeviceFlowAccessDeniedError()
      default:
        throw new Error(`Device token error: ${data.error}`)
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to poll for token: ${response.status}`)
  }

  return data as DeviceTokenResponse
}

/**
 * Fetches user session information using the access token.
 */
const fetchSession = async (
  baseUrl: string,
  accessToken: string
): Promise<SessionResponse> => {
  const url = new URL('/api/auth/get-session', baseUrl)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Failed to fetch session: ${response.status} ${errorText}`
    )
  }

  return response.json()
}

/**
 * Result from successful pollForToken call.
 */
export interface PollForTokenResult {
  refreshToken: string
  user: SessionResponse['user']
  expiresAt: string
}

/**
 * Polls the device token endpoint until the user authorizes or the code expires.
 *
 * This implements the polling loop as specified in RFC 8628:
 * - Waits for the specified interval between poll attempts
 * - Handles `authorization_pending` by continuing to poll
 * - Handles `slow_down` by increasing the interval by 5 seconds
 * - Throws on `expired_token` or `access_denied`
 *
 * @param baseUrl - The base URL of the Flowglad API
 * @param deviceCode - The device code from requestDeviceCode
 * @param interval - Initial polling interval in seconds
 * @param expiresIn - Time in seconds until the device code expires
 * @returns The refresh token and user information
 */
export const pollForToken = async (
  baseUrl: string,
  deviceCode: string,
  interval: number,
  expiresIn: number
): Promise<PollForTokenResult> => {
  const startTime = Date.now()
  const expiresAtMs = startTime + expiresIn * 1000
  let currentInterval = interval

  while (Date.now() < expiresAtMs) {
    // Wait before polling (as per RFC 8628)
    await sleep(currentInterval * 1000)

    try {
      const tokenResponse = await pollTokenOnce(baseUrl, deviceCode)

      // Success - fetch user session info
      const sessionResponse = await fetchSession(
        baseUrl,
        tokenResponse.access_token
      )

      return {
        refreshToken: tokenResponse.access_token,
        user: sessionResponse.user,
        expiresAt: sessionResponse.session.expiresAt,
      }
    } catch (error) {
      if (error instanceof DeviceFlowAuthorizationPendingError) {
        // Continue polling
        continue
      }

      if (error instanceof DeviceFlowSlowDownError) {
        // Increase interval by 5 seconds as per RFC 8628
        currentInterval += 5
        continue
      }

      // Re-throw other errors (expired_token, access_denied, network errors)
      throw error
    }
  }

  // If we exit the loop, the device code has expired
  throw new DeviceFlowExpiredTokenError()
}
