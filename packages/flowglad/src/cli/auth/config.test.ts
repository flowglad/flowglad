import { chmod, mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearCredentials,
  ensureConfigDir,
  getConfigDir,
  getCredentialsPath,
  isRefreshTokenExpired,
  loadCredentials,
  type StoredCredentials,
  saveCredentials,
} from './config'

describe('CLI credential storage', () => {
  let testConfigDir: string
  let originalConfigDir: string | undefined

  beforeEach(async () => {
    // Save original env var
    originalConfigDir = process.env.FLOWGLAD_CONFIG_DIR

    // Create a unique test directory
    testConfigDir = join(
      tmpdir(),
      `flowglad-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testConfigDir, { recursive: true })

    // Set env var to use test directory
    process.env.FLOWGLAD_CONFIG_DIR = testConfigDir
  })

  afterEach(async () => {
    // Restore original env var
    if (originalConfigDir !== undefined) {
      process.env.FLOWGLAD_CONFIG_DIR = originalConfigDir
    } else {
      delete process.env.FLOWGLAD_CONFIG_DIR
    }

    // Clean up test directory
    try {
      await rm(testConfigDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  const createTestCredentials = (
    overrides: Partial<StoredCredentials> = {}
  ): StoredCredentials => ({
    refreshToken: 'ba_session_test_token_123',
    refreshTokenExpiresAt: new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000
    ).toISOString(),
    userId: 'user_test_123',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  })

  describe('getConfigDir', () => {
    it('returns the path set by FLOWGLAD_CONFIG_DIR environment variable', () => {
      expect(getConfigDir()).toBe(testConfigDir)
    })
  })

  describe('getCredentialsPath', () => {
    it('returns credentials.json inside the config directory', () => {
      expect(getCredentialsPath()).toBe(
        join(testConfigDir, 'credentials.json')
      )
    })
  })

  describe('ensureConfigDir', () => {
    it('creates the config directory with 700 permissions when it does not exist', async () => {
      // Remove the test directory so ensureConfigDir has to create it
      await rm(testConfigDir, { recursive: true })

      await ensureConfigDir()

      const stats = await stat(testConfigDir)
      expect(stats.isDirectory()).toBe(true)
      expect(stats.mode & 0o777).toBe(0o700)
    })

    it('fixes permissions to 700 when the directory exists with different permissions', async () => {
      // Set incorrect permissions
      await chmod(testConfigDir, 0o755)

      await ensureConfigDir()

      const stats = await stat(testConfigDir)
      expect(stats.mode & 0o777).toBe(0o700)
    })
  })

  describe('saveCredentials', () => {
    it('writes credentials file with 600 permissions and correct JSON content', async () => {
      const credentials = createTestCredentials()

      await saveCredentials(credentials)

      const credentialsPath = getCredentialsPath()
      const stats = await stat(credentialsPath)

      // Verify file exists and has correct permissions
      expect(stats.isFile()).toBe(true)
      expect(stats.mode & 0o777).toBe(0o600)

      // Verify content is correct
      const loaded = await loadCredentials()
      expect(loaded).toEqual(credentials)
    })

    it('overwrites existing credentials file when saving new credentials', async () => {
      const oldCredentials = createTestCredentials({
        email: 'old@example.com',
      })
      const newCredentials = createTestCredentials({
        email: 'new@example.com',
      })

      await saveCredentials(oldCredentials)
      await saveCredentials(newCredentials)

      const loaded = await loadCredentials()
      expect(loaded?.email).toBe('new@example.com')
    })

    it('saves credentials with optional access token fields', async () => {
      const credentials = createTestCredentials({
        accessToken: 'cli_test_xxxx_abc123',
        accessTokenExpiresAt: new Date(
          Date.now() + 10 * 60 * 1000
        ).toISOString(),
        organizationId: 'org_test_456',
        organizationName: 'Test Org',
        pricingModelId: 'pm_test_789',
        pricingModelName: 'Starter Plan',
        livemode: false,
      })

      await saveCredentials(credentials)

      const loaded = await loadCredentials()
      expect(loaded).toEqual(credentials)
      expect(loaded?.accessToken).toBe('cli_test_xxxx_abc123')
      expect(loaded?.organizationId).toBe('org_test_456')
      expect(loaded?.livemode).toBe(false)
    })
  })

  describe('loadCredentials', () => {
    it('returns null when no credentials file exists', async () => {
      const result = await loadCredentials()

      expect(result).toBeNull()
    })

    it('returns parsed credentials when file exists with valid JSON', async () => {
      const credentials = createTestCredentials()
      await saveCredentials(credentials)

      const loaded = await loadCredentials()

      expect(loaded).toEqual(credentials)
      expect(loaded?.refreshToken).toBe('ba_session_test_token_123')
      expect(loaded?.userId).toBe('user_test_123')
      expect(loaded?.email).toBe('test@example.com')
      expect(loaded?.name).toBe('Test User')
    })
  })

  describe('clearCredentials', () => {
    it('removes the credentials file when it exists', async () => {
      const credentials = createTestCredentials()
      await saveCredentials(credentials)

      // Verify file exists
      const loadedBefore = await loadCredentials()
      expect(loadedBefore).toEqual(credentials)

      await clearCredentials()

      // Verify file is gone
      const loadedAfter = await loadCredentials()
      expect(loadedAfter).toBeNull()
    })

    it('does not throw when credentials file does not exist', async () => {
      // Ensure no credentials exist
      const loaded = await loadCredentials()
      expect(loaded).toBeNull()

      // Should not throw
      await expect(clearCredentials()).resolves.not.toThrow()
    })
  })

  describe('isRefreshTokenExpired', () => {
    it('returns true when the refresh token is expired', () => {
      const credentials = createTestCredentials({
        refreshTokenExpiresAt: new Date(
          Date.now() - 1000
        ).toISOString(),
      })

      expect(isRefreshTokenExpired(credentials)).toBe(true)
    })

    it('returns true when the refresh token will expire within the buffer period', () => {
      const credentials = createTestCredentials({
        // Expires in 2 minutes, default buffer is 5 minutes
        refreshTokenExpiresAt: new Date(
          Date.now() + 2 * 60 * 1000
        ).toISOString(),
      })

      expect(isRefreshTokenExpired(credentials)).toBe(true)
    })

    it('returns false when the refresh token is not expired and outside buffer period', () => {
      const credentials = createTestCredentials({
        // Expires in 90 days
        refreshTokenExpiresAt: new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })

      expect(isRefreshTokenExpired(credentials)).toBe(false)
    })

    it('respects custom buffer time when checking expiration', () => {
      const credentials = createTestCredentials({
        // Expires in 10 seconds
        refreshTokenExpiresAt: new Date(
          Date.now() + 10 * 1000
        ).toISOString(),
      })

      // With 5 second buffer, should not be expired
      expect(isRefreshTokenExpired(credentials, 5 * 1000)).toBe(false)

      // With 15 second buffer, should be expired
      expect(isRefreshTokenExpired(credentials, 15 * 1000)).toBe(true)
    })
  })
})
