import type { CAC } from 'cac'
import {
  isRefreshTokenExpired,
  loadCredentials,
  saveCredentials,
} from '../auth/config'
import {
  DeviceFlowAccessDeniedError,
  DeviceFlowExpiredTokenError,
  pollForToken,
  requestDeviceCode,
} from '../auth/deviceFlow'

const DEFAULT_BASE_URL = 'https://flowglad.com'

/**
 * Gets the base URL for the Flowglad API.
 * Can be overridden with FLOWGLAD_API_URL environment variable.
 */
export const getBaseUrl = (): string => {
  return process.env.FLOWGLAD_API_URL ?? DEFAULT_BASE_URL
}

interface LoginOptions {
  browser: boolean
}

/**
 * Opens a URL in the system's default browser.
 * Uses dynamic import to support ESM-only 'open' package.
 */
const openBrowser = async (url: string): Promise<void> => {
  const { default: open } = await import('open')
  await open(url)
}

/**
 * Executes the login flow.
 *
 * 1. Check if already logged in
 * 2. Request device code from Better Auth
 * 3. Display verification URL and user code
 * 4. Open browser (unless --no-browser)
 * 5. Poll for authorization
 * 6. Save credentials
 */
export const loginFlow = async (
  options: LoginOptions
): Promise<void> => {
  const baseUrl = getBaseUrl()

  // Check if already logged in with valid credentials
  const existingCredentials = await loadCredentials()
  if (
    existingCredentials &&
    !isRefreshTokenExpired(existingCredentials)
  ) {
    console.log(`Already logged in as ${existingCredentials.email}`)
    console.log('Run `flowglad logout` to sign out.')
    return
  }

  // Request device code
  console.log('Requesting authorization...')
  let deviceCodeResponse
  try {
    deviceCodeResponse = await requestDeviceCode(baseUrl)
  } catch (error) {
    if (process.env.DEBUG) {
      console.error('Debug:', error)
    }
    console.error(
      'Error: Failed to connect to Flowglad. Please check your internet connection.'
    )
    process.exit(1)
    return
  }

  // Display verification info
  console.log('')
  console.log('To authenticate, please visit:')
  console.log(`  ${deviceCodeResponse.verificationUriComplete}`)
  console.log('')
  console.log(
    `Or go to ${deviceCodeResponse.verificationUri} and enter code:`
  )
  console.log(`  ${deviceCodeResponse.userCode}`)
  console.log('')

  // Open browser if requested
  if (options.browser) {
    console.log('Opening browser...')
    try {
      await openBrowser(deviceCodeResponse.verificationUriComplete)
    } catch {
      console.log('Could not open browser automatically.')
      console.log('Please open the URL above manually.')
    }
  }

  // Poll for authorization
  console.log('Waiting for authorization...')
  console.log('(Press Ctrl+C to cancel)')
  console.log('')

  try {
    const result = await pollForToken(
      baseUrl,
      deviceCodeResponse.deviceCode,
      deviceCodeResponse.interval,
      deviceCodeResponse.expiresIn
    )

    // Save credentials
    await saveCredentials({
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: new Date(result.expiresAt).getTime(),
      userId: result.user.id,
      email: result.user.email,
      name: result.user.name,
    })

    console.log(`Logged in as ${result.user.email}`)
  } catch (error) {
    if (error instanceof DeviceFlowExpiredTokenError) {
      console.error(
        'Error: Authorization code expired. Please try again.'
      )
      process.exit(1)
      return
    }
    if (error instanceof DeviceFlowAccessDeniedError) {
      console.error('Error: Authorization was denied.')
      process.exit(1)
      return
    }
    throw error
  }
}

/**
 * Registers the login command with the CLI.
 */
export const registerLoginCommand = (cli: CAC): void => {
  cli
    .command('login', 'Authenticate with Flowglad')
    .option('--no-browser', 'Print URL instead of opening browser')
    .action(async (options: LoginOptions) => {
      await loginFlow(options)
    })
}
