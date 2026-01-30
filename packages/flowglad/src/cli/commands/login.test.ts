import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest'
import {
  loadCredentials,
  type StoredCredentials,
} from '../auth/config'
import { getBaseUrl, loginFlow } from './login'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock the open package
const mockOpen = vi.fn().mockResolvedValue(undefined)
vi.mock('open', () => ({
  default: mockOpen,
}))

describe('login command', () => {
  let testConfigDir: string
  let originalConfigDir: string | undefined
  let originalApiUrl: string | undefined
  let consoleLogSpy: MockInstance
  let consoleErrorSpy: MockInstance
  let processExitSpy: MockInstance

  beforeEach(async () => {
    // Save original env vars
    originalConfigDir = process.env.FLOWGLAD_CONFIG_DIR
    originalApiUrl = process.env.FLOWGLAD_API_URL

    // Create a unique test directory
    testConfigDir = join(
      tmpdir(),
      `flowglad-login-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testConfigDir, { recursive: true })

    // Set env vars for testing
    process.env.FLOWGLAD_CONFIG_DIR = testConfigDir
    process.env.FLOWGLAD_API_URL = 'https://flowglad.com'

    // Reset mocks
    mockFetch.mockReset()
    mockOpen.mockReset()
    mockOpen.mockResolvedValue(undefined)

    // biome-ignore lint/plugin: capturing console output for test assertions
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => {})
    // biome-ignore lint/plugin: capturing console output for test assertions
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    // biome-ignore lint/plugin: mocking process.exit to prevent test process from exiting
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)
  })

  afterEach(async () => {
    // Restore original env vars
    if (originalConfigDir !== undefined) {
      process.env.FLOWGLAD_CONFIG_DIR = originalConfigDir
    } else {
      delete process.env.FLOWGLAD_CONFIG_DIR
    }
    if (originalApiUrl !== undefined) {
      process.env.FLOWGLAD_API_URL = originalApiUrl
    } else {
      delete process.env.FLOWGLAD_API_URL
    }

    // Restore spies
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    processExitSpy.mockRestore()

    // Clean up test directory
    try {
      await rm(testConfigDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('getBaseUrl', () => {
    it('returns FLOWGLAD_API_URL when set', () => {
      process.env.FLOWGLAD_API_URL = 'https://custom.flowglad.dev'

      expect(getBaseUrl()).toBe('https://custom.flowglad.dev')
    })

    it('returns default URL when FLOWGLAD_API_URL is not set', () => {
      delete process.env.FLOWGLAD_API_URL

      expect(getBaseUrl()).toBe('https://flowglad.com')
    })
  })

  describe('loginFlow', () => {
    const mockDeviceCodeResponse = {
      device_code: 'dev_code_abc123',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://flowglad.com/device',
      verification_uri_complete:
        'https://flowglad.com/device?user_code=ABCD-EFGH',
      expires_in: 600,
      interval: 5,
    }

    const mockTokenResponse = {
      access_token: 'ba_session_xyz789',
      token_type: 'Bearer',
      expires_in: 7776000,
      scope: '',
    }

    const mockSessionResponse = {
      user: {
        id: 'user_123',
        email: 'dev@example.com',
        name: 'Developer',
      },
      session: {
        id: 'session_abc',
        expiresAt: '2026-04-29T12:00:00.000Z',
      },
    }

    it('displays verification URL and user code when initiating login flow', async () => {
      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock token response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        // Mock session response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSessionResponse),
        })

      await loginFlow({ browser: false })

      // Verify verification URL was displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '  https://flowglad.com/device?user_code=ABCD-EFGH'
      )

      // Verify user code was displayed
      expect(consoleLogSpy).toHaveBeenCalledWith('  ABCD-EFGH')

      // Verify verification URI was displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://flowglad.com/device')
      )

      // Verify success message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Logged in as dev@example.com'
      )
    })

    it('shows already logged in message when valid credentials exist', async () => {
      // Create existing credentials
      const existingCredentials: StoredCredentials = {
        refreshToken: 'ba_session_existing_token',
        refreshTokenExpiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
        userId: 'user_existing_123',
        email: 'existing@example.com',
        name: 'Existing User',
      }

      // Write credentials to file
      const credentialsPath = join(testConfigDir, 'credentials.json')
      await writeFile(
        credentialsPath,
        JSON.stringify(existingCredentials, null, 2),
        { mode: 0o600 }
      )

      await loginFlow({ browser: false })

      // Should show already logged in message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Already logged in as existing@example.com'
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Run `flowglad logout` to sign out.'
      )

      // Should not have called fetch (no device code request)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('proceeds with login when existing credentials are expired', async () => {
      // Create expired credentials
      const expiredCredentials: StoredCredentials = {
        refreshToken: 'ba_session_expired_token',
        refreshTokenExpiresAt: Date.now() - 1000, // Expired
        userId: 'user_expired_123',
        email: 'expired@example.com',
        name: 'Expired User',
      }

      // Write expired credentials to file
      const credentialsPath = join(testConfigDir, 'credentials.json')
      await writeFile(
        credentialsPath,
        JSON.stringify(expiredCredentials, null, 2),
        { mode: 0o600 }
      )

      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock token response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        // Mock session response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSessionResponse),
        })

      await loginFlow({ browser: false })

      // Should have proceeded with login (called fetch for device code)
      expect(mockFetch).toHaveBeenCalled()

      // Should show new login success
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Logged in as dev@example.com'
      )
    })

    it('exits with code 1 and displays error when user denies access', async () => {
      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock access denied response
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              error: 'access_denied',
              error_description: 'User denied access',
            }),
        })

      await loginFlow({ browser: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: Authorization was denied.'
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('exits with code 1 and displays error when device code expires', async () => {
      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock expired token response
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () =>
            Promise.resolve({
              error: 'expired_token',
              error_description: 'The device code has expired',
            }),
        })

      await loginFlow({ browser: false })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: Authorization code expired. Please try again.'
      )
      expect(processExitSpy).toHaveBeenCalledWith(1)
    })

    it('saves credentials after successful authentication', async () => {
      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock token response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        // Mock session response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSessionResponse),
        })

      await loginFlow({ browser: false })

      // Verify saved credentials
      const savedCredentials = await loadCredentials()

      expect(savedCredentials?.refreshToken).toBe('ba_session_xyz789')
      expect(savedCredentials?.userId).toBe('user_123')
      expect(savedCredentials?.email).toBe('dev@example.com')
      expect(savedCredentials?.name).toBe('Developer')
    })

    it('attempts to open browser when browser option is true', async () => {
      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock token response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        // Mock session response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSessionResponse),
        })

      await loginFlow({ browser: true })

      expect(mockOpen).toHaveBeenCalledWith(
        'https://flowglad.com/device?user_code=ABCD-EFGH'
      )
    })

    it('does not attempt to open browser when browser option is false', async () => {
      // Mock device code request
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDeviceCodeResponse),
        })
        // Mock token response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTokenResponse),
        })
        // Mock session response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSessionResponse),
        })

      await loginFlow({ browser: false })

      expect(mockOpen).not.toHaveBeenCalled()
    })
  })
})
