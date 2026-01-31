import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  loadCredentials,
  type StoredCredentials,
  saveCredentials,
} from '../auth/config'
import { logoutFlow } from './logout'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock console.log to capture output
const mockConsoleLog = vi.fn()
vi.stubGlobal('console', { ...console, log: mockConsoleLog })

describe('logout command', () => {
  let testConfigDir: string
  let originalConfigDir: string | undefined
  let originalApiUrl: string | undefined

  const createTestCredentials = (
    overrides: Partial<StoredCredentials> = {}
  ): StoredCredentials => ({
    refreshToken: 'ba_session_test_token_123',
    refreshTokenExpiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    userId: 'user_test_123',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  })

  beforeEach(async () => {
    // Reset mocks
    mockFetch.mockReset()
    mockConsoleLog.mockReset()

    // Save original env vars
    originalConfigDir = process.env.FLOWGLAD_CONFIG_DIR
    originalApiUrl = process.env.FLOWGLAD_API_URL

    // Create a unique test directory
    testConfigDir = join(
      tmpdir(),
      `flowglad-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testConfigDir, { recursive: true })

    // Set env vars for testing
    process.env.FLOWGLAD_CONFIG_DIR = testConfigDir
    process.env.FLOWGLAD_API_URL = 'https://flowglad.com'
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

    // Clean up test directory
    try {
      await rm(testConfigDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('clears stored credentials, invalidates server session, and displays success message when user is logged in', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock successful sign-out response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    await logoutFlow()

    // Verify server sign-out was called with correct parameters
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://flowglad.com/api/auth/sign-out',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ba_session_test_token_123',
          'Content-Type': 'application/json',
        },
      }
    )

    // Verify success message was displayed with user name
    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Logged out successfully. Goodbye, Test User!'
    )

    // Verify credentials were cleared
    const loadedCredentials = await loadCredentials()
    expect(loadedCredentials).toBeNull()
  })

  it('uses email in goodbye message when user name is not available', async () => {
    const credentials = createTestCredentials({ name: undefined })
    await saveCredentials(credentials)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    await logoutFlow()

    // Verify fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Verify message uses email instead of name
    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Logged out successfully. Goodbye, test@example.com!'
    )

    // Verify credentials were cleared
    const loadedCredentials = await loadCredentials()
    expect(loadedCredentials).toBeNull()
  })

  it('clears local credentials and shows appropriate message when server sign-out fails', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock failed sign-out response (e.g., session already expired)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    })

    await logoutFlow()

    // Verify sign-out was attempted
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Verify appropriate message was displayed
    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Logged out locally. (Server session may have already expired)'
    )

    // Verify credentials were still cleared locally
    const loadedCredentials = await loadCredentials()
    expect(loadedCredentials).toBeNull()
  })

  it('clears local credentials and shows appropriate message when network error occurs', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock network error
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    await logoutFlow()

    // Verify sign-out was attempted
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Verify appropriate message was displayed
    expect(mockConsoleLog).toHaveBeenCalledWith(
      'Logged out locally. (Server session may have already expired)'
    )

    // Verify credentials were still cleared locally
    const loadedCredentials = await loadCredentials()
    expect(loadedCredentials).toBeNull()
  })

  it('displays not logged in message and does not call server when no credentials exist', async () => {
    // No credentials saved

    await logoutFlow()

    // Verify server sign-out was NOT called
    expect(mockFetch).not.toHaveBeenCalled()

    // Verify appropriate message was displayed
    expect(mockConsoleLog).toHaveBeenCalledWith(
      'You are not logged in.'
    )
  })
})
