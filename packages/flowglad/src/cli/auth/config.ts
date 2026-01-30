import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Stored credentials for the Flowglad CLI.
 * Contains both refresh token (Better Auth session) and optional access token (Unkey API key).
 */
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
 * Returns the Flowglad config directory path.
 * Default: ~/.flowglad
 * Can be overridden with FLOWGLAD_CONFIG_DIR environment variable (used for testing).
 */
export const getConfigDir = (): string => {
  return (
    process.env.FLOWGLAD_CONFIG_DIR ?? join(homedir(), '.flowglad')
  )
}

/**
 * Returns the credentials file path.
 * Default: ~/.flowglad/credentials.json
 */
export const getCredentialsPath = (): string => {
  return join(getConfigDir(), 'credentials.json')
}

/**
 * Ensures the config directory exists with 700 permissions.
 * Creates the directory if it doesn't exist.
 * Fixes permissions if they differ from 700.
 */
export const ensureConfigDir = async (): Promise<void> => {
  const configDir = getConfigDir()
  const expectedMode = 0o700

  try {
    const stats = await stat(configDir)
    // Check if permissions match (mask out file type bits)
    const currentMode = stats.mode & 0o777
    if (currentMode !== expectedMode) {
      await chmod(configDir, expectedMode)
    }
  } catch (error) {
    // Directory doesn't exist, create it
    if (isNodeError(error) && error.code === 'ENOENT') {
      await mkdir(configDir, { mode: expectedMode, recursive: true })
    } else {
      throw error
    }
  }
}

/**
 * Saves credentials to the credentials file.
 * Uses atomic write (write to temp file, then rename) to prevent corruption.
 * Sets file permissions to 600 (owner read/write only).
 */
export const saveCredentials = async (
  credentials: StoredCredentials
): Promise<void> => {
  await ensureConfigDir()

  const credentialsPath = getCredentialsPath()
  // Use same directory as target to ensure atomic rename works across filesystems
  const tempPath = join(
    getConfigDir(),
    `.credentials-${Date.now()}.tmp`
  )

  // Write to temp file first
  const content = JSON.stringify(credentials, null, 2)
  await writeFile(tempPath, content, { mode: 0o600 })

  // Ensure temp file has correct permissions
  await chmod(tempPath, 0o600)

  // Atomic rename
  await rename(tempPath, credentialsPath)

  // Ensure final file has correct permissions
  await chmod(credentialsPath, 0o600)
}

/**
 * Loads credentials from the credentials file.
 * Returns null if the file doesn't exist or is invalid.
 */
export const loadCredentials =
  async (): Promise<StoredCredentials | null> => {
    const credentialsPath = getCredentialsPath()

    try {
      const content = await readFile(credentialsPath, 'utf-8')
      return JSON.parse(content) as StoredCredentials
    } catch (error) {
      // Return null if file doesn't exist or contains invalid JSON
      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }
      if (error instanceof SyntaxError) {
        return null
      }
      throw error
    }
  }

/**
 * Clears stored credentials by removing the credentials file.
 * Does not throw if the file doesn't exist.
 */
export const clearCredentials = async (): Promise<void> => {
  const credentialsPath = getCredentialsPath()

  try {
    await rm(credentialsPath)
  } catch (error) {
    // Ignore if file doesn't exist
    if (isNodeError(error) && error.code === 'ENOENT') {
      return
    }
    throw error
  }
}

/**
 * Checks if the refresh token is expired or will expire within the given buffer.
 * @param credentials The stored credentials
 * @param bufferMs Buffer time in milliseconds before actual expiration (default: 5 minutes)
 */
export const isRefreshTokenExpired = (
  credentials: StoredCredentials,
  bufferMs = 5 * 60 * 1000
): boolean => {
  const expiresAt = new Date(
    credentials.refreshTokenExpiresAt
  ).getTime()
  return Date.now() + bufferMs >= expiresAt
}

/**
 * Type guard for Node.js errors with code property.
 */
const isNodeError = (
  error: unknown
): error is NodeJS.ErrnoException => {
  return error instanceof Error && 'code' in error
}
