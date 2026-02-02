/**
 * Device flow tests.
 *
 * Note: These tests use vitest-specific APIs (vi.stubGlobal, vi.useFakeTimers).
 * Run with `bun run test`, not `bun test` directly.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  DeviceFlowAccessDeniedError,
  DeviceFlowExpiredTokenError,
  pollForToken,
  requestDeviceCode,
} from './deviceFlow'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('requestDeviceCode', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns device code and verification URI when the server responds with valid device code data', async () => {
    const mockResponse = {
      device_code: 'dev_code_abc123',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://flowglad.com/device',
      verification_uri_complete:
        'https://flowglad.com/device?user_code=ABCD-EFGH',
      expires_in: 600,
      interval: 5,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await requestDeviceCode('https://flowglad.com')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://flowglad.com/api/auth/device/code',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: 'flowglad-cli',
        }),
      }
    )

    expect(result.deviceCode).toBe('dev_code_abc123')
    expect(result.userCode).toBe('ABCD-EFGH')
    expect(result.verificationUri).toBe('https://flowglad.com/device')
    expect(result.verificationUriComplete).toBe(
      'https://flowglad.com/device?user_code=ABCD-EFGH'
    )
    expect(result.expiresIn).toBe(600)
    expect(result.interval).toBe(5)
  })

  it('throws an error with status and message when server responds with non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad Request'),
    })

    await expect(
      requestDeviceCode('https://flowglad.com')
    ).rejects.toThrow(
      'Failed to request device code: 400 Bad Request'
    )
  })
})

describe('pollForToken', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('returns refresh token and user data after user authorizes the device', async () => {
    const tokenResponse = {
      access_token: 'ba_session_xyz789',
      token_type: 'Bearer',
      expires_in: 7776000, // 90 days
      scope: '',
    }

    const sessionResponse = {
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

    // First call: token endpoint returns success
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponse),
      })
      // Second call: session endpoint returns user info
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sessionResponse),
      })

    const pollPromise = pollForToken(
      'https://flowglad.com',
      'device_code_abc',
      5,
      600
    )

    // Advance timers to trigger the first poll
    await vi.advanceTimersByTimeAsync(5000)

    const result = await pollPromise

    expect(result.refreshToken).toBe('ba_session_xyz789')
    expect(result.user.id).toBe('user_123')
    expect(result.user.email).toBe('dev@example.com')
    expect(result.user.name).toBe('Developer')
    expect(result.expiresAt).toBe('2026-04-29T12:00:00.000Z')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://flowglad.com/api/auth/device/token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          device_code: 'device_code_abc',
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: 'flowglad-cli',
        }),
      })
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://flowglad.com/api/auth/get-session',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer ba_session_xyz789',
        },
      })
    )
  })

  it('continues polling when server responds with authorization_pending until user authorizes', async () => {
    const pendingResponse = {
      error: 'authorization_pending',
      error_description: 'The user has not yet authorized the device',
    }

    const tokenResponse = {
      access_token: 'ba_session_success',
      token_type: 'Bearer',
      expires_in: 7776000,
      scope: '',
    }

    const sessionResponse = {
      user: {
        id: 'user_456',
        email: 'test@example.com',
        name: 'Tester',
      },
      session: {
        id: 'session_def',
        expiresAt: '2026-04-29T12:00:00.000Z',
      },
    }

    // First poll: authorization_pending
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(pendingResponse),
      })
      // Second poll: authorization_pending
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(pendingResponse),
      })
      // Third poll: success
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponse),
      })
      // Session fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sessionResponse),
      })

    const pollPromise = pollForToken(
      'https://flowglad.com',
      'device_code_pending',
      5,
      600
    )

    // First poll after 5 seconds
    await vi.advanceTimersByTimeAsync(5000)
    // Second poll after another 5 seconds
    await vi.advanceTimersByTimeAsync(5000)
    // Third poll after another 5 seconds
    await vi.advanceTimersByTimeAsync(5000)

    const result = await pollPromise

    expect(result.refreshToken).toBe('ba_session_success')
    expect(result.user.email).toBe('test@example.com')
    // 3 token polls + 1 session fetch = 4 total
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('throws DeviceFlowExpiredTokenError when server responds with expired_token', async () => {
    const expiredResponse = {
      error: 'expired_token',
      error_description: 'The device code has expired',
    }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve(expiredResponse),
    })

    // Attach catch immediately to prevent unhandled rejection warnings
    const errorHolder: { error: Error | null } = { error: null }
    const pollPromise = pollForToken(
      'https://flowglad.com',
      'device_code_expired',
      5,
      600
    ).catch((err) => {
      errorHolder.error = err
    })

    // Advance timers to trigger the first poll
    await vi.advanceTimersByTimeAsync(5000)

    // Wait for promise to settle
    await pollPromise

    expect(errorHolder.error).toBeInstanceOf(
      DeviceFlowExpiredTokenError
    )
    expect(errorHolder.error?.message).toBe('Device code has expired')
  })

  it('increases polling interval by 5 seconds when server responds with slow_down', async () => {
    const slowDownResponse = {
      error: 'slow_down',
      error_description: 'Polling too frequently',
    }

    const tokenResponse = {
      access_token: 'ba_session_after_slowdown',
      token_type: 'Bearer',
      expires_in: 7776000,
      scope: '',
    }

    const sessionResponse = {
      user: {
        id: 'user_789',
        email: 'slow@example.com',
        name: 'Slower',
      },
      session: {
        id: 'session_ghi',
        expiresAt: '2026-04-29T12:00:00.000Z',
      },
    }

    // First poll: slow_down
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(slowDownResponse),
      })
      // Second poll: success (should be after 10 seconds, not 5)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(tokenResponse),
      })
      // Session fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(sessionResponse),
      })

    const pollPromise = pollForToken(
      'https://flowglad.com',
      'device_code_slow',
      5,
      600
    )

    // First poll after initial 5 seconds
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // After slow_down, interval should be 10 seconds (5 + 5)
    // Advance 5 more seconds - should not trigger second poll yet
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Advance remaining 5 seconds (total 10 from first poll)
    await vi.advanceTimersByTimeAsync(5000)

    const result = await pollPromise

    expect(result.refreshToken).toBe('ba_session_after_slowdown')
    expect(mockFetch).toHaveBeenCalledTimes(3) // 2 token polls + 1 session fetch
  })

  it('throws DeviceFlowAccessDeniedError when server responds with access_denied', async () => {
    const deniedResponse = {
      error: 'access_denied',
      error_description: 'The user denied access',
    }

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve(deniedResponse),
    })

    // Attach catch immediately to prevent unhandled rejection warnings
    const errorHolder: { error: Error | null } = { error: null }
    const pollPromise = pollForToken(
      'https://flowglad.com',
      'device_code_denied',
      5,
      600
    ).catch((err) => {
      errorHolder.error = err
    })

    // Advance timers to trigger the first poll
    await vi.advanceTimersByTimeAsync(5000)

    // Wait for promise to settle
    await pollPromise

    expect(errorHolder.error).toBeInstanceOf(
      DeviceFlowAccessDeniedError
    )
    expect(errorHolder.error?.message).toBe('User denied access')
  })

  it('throws DeviceFlowExpiredTokenError when polling loop exceeds expiresIn duration', async () => {
    const pendingResponse = {
      error: 'authorization_pending',
      error_description: 'The user has not yet authorized the device',
    }

    // Always return authorization_pending
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve(pendingResponse),
    })

    // Attach catch immediately to prevent unhandled rejection warnings
    const errorHolder: { error: Error | null } = { error: null }
    const pollPromise = pollForToken(
      'https://flowglad.com',
      'device_code_timeout',
      5,
      15 // Short expiration time for testing
    ).catch((err) => {
      errorHolder.error = err
    })

    // First poll after 5 seconds
    await vi.advanceTimersByTimeAsync(5000)
    // Second poll after another 5 seconds
    await vi.advanceTimersByTimeAsync(5000)
    // Third poll after another 5 seconds (now at 15 seconds)
    await vi.advanceTimersByTimeAsync(5000)
    // Fourth attempt would be at 20 seconds, past expiration
    await vi.advanceTimersByTimeAsync(5000)

    // Wait for promise to settle
    await pollPromise

    expect(errorHolder.error).toBeInstanceOf(
      DeviceFlowExpiredTokenError
    )
    expect(errorHolder.error?.message).toBe('Device code has expired')
  })
})
