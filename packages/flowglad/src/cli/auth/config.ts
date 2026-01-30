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
 * Throws if the path exists but is not a directory.
 */
export const ensureConfigDir = async (): Promise<void> => {
  const configDir = getConfigDir()
  const expectedMode = 0o700

  try {
    const stats = await stat(configDir)
    // Verify the path is actually a directory
    if (!stats.isDirectory()) {
      throw new Error(
        `Config path exists and is not a directory: ${configDir}`
      )
    }
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
  // Include random suffix to avoid collision if multiple processes write simultaneously
  const tempPath = join(
    getConfigDir(),
    `.credentials-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
  )

  try {
    // Write to temp file first
    const content = JSON.stringify(credentials, null, 2)
    await writeFile(tempPath, content, { mode: 0o600 })

    // Ensure temp file has correct permissions
    await chmod(tempPath, 0o600)

    // Atomic rename
    await rename(tempPath, credentialsPath)

    // Ensure final file has correct permissions
    await chmod(credentialsPath, 0o600)
  } catch (error) {
    // Clean up temp file on failure
    try {
      await rm(tempPath, { force: true })
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

/**
 * Type guard to validate the shape of stored credentials.
 */
const isStoredCredentials = (
  obj: unknown
): obj is StoredCredentials => {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  const record = obj as Record<string, unknown>
  return (
    typeof record.refreshToken === 'string' &&
    typeof record.refreshTokenExpiresAt === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.email === 'string' &&
    (record.name === undefined || typeof record.name === 'string') &&
    (record.accessToken === undefined ||
      typeof record.accessToken === 'string') &&
    (record.accessTokenExpiresAt === undefined ||
      typeof record.accessTokenExpiresAt === 'string') &&
    (record.organizationId === undefined ||
      typeof record.organizationId === 'string') &&
    (record.organizationName === undefined ||
      typeof record.organizationName === 'string') &&
    (record.pricingModelId === undefined ||
      typeof record.pricingModelId === 'string') &&
    (record.pricingModelName === undefined ||
      typeof record.pricingModelName === 'string') &&
    (record.livemode === undefined ||
      typeof record.livemode === 'boolean')
  )
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
      const parsed: unknown = JSON.parse(content)
      if (!isStoredCredentials(parsed)) {
        return null
      }
      return parsed
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
 * Invalid or missing timestamps are treated as expired to force re-authentication.
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
  // Treat invalid timestamps (NaN) as expired
  if (Number.isNaN(expiresAt)) {
    return true
  }
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
