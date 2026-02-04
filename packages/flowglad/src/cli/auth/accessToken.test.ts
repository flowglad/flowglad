import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  ensureValidAccessToken,
  isAccessTokenExpired,
  requestAccessToken,
  type StoredCredentials,
} from './accessToken'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('requestAccessToken', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns Unkey API key with expiry when request succeeds', async () => {
    const mockResponse = {
      accessToken: 'cli_t_abcd_xyz123',
      expiresAt: '2026-01-30T12:10:00.000Z',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })

    const result = await requestAccessToken(
      'https://api.flowglad.com',
      'refresh_token_123',
      {
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: false,
      }
    )

    expect(result.accessToken).toBe('cli_t_abcd_xyz123')
    expect(result.expiresAt).toBe('2026-01-30T12:10:00.000Z')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.flowglad.com/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer refresh_token_123',
        },
        body: JSON.stringify({
          organizationId: 'org_123',
          pricingModelId: 'pm_456',
          livemode: false,
        }),
      }
    )
  })

  it('throws error when request fails with error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          error: 'Unauthorized',
          message: 'Invalid session',
        }),
    })

    await expect(
      requestAccessToken(
        'https://api.flowglad.com',
        'invalid_token',
        {
          organizationId: 'org_123',
          pricingModelId: 'pm_456',
          livemode: false,
        }
      )
    ).rejects.toThrow('Failed to get access token: Invalid session')
  })

  it('throws error with HTTP status when no error message available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('JSON parse error')),
    })

    await expect(
      requestAccessToken('https://api.flowglad.com', 'token', {
        organizationId: 'org_123',
        pricingModelId: 'pm_456',
        livemode: false,
      })
    ).rejects.toThrow('Failed to get access token: HTTP 500')
  })
})

describe('isAccessTokenExpired', () => {
  it('returns true for expired token', () => {
    // Token expired 1 minute ago (epoch ms)
    const expiredAt = Date.now() - 60 * 1000
    expect(isAccessTokenExpired(expiredAt)).toBe(true)
  })

  it('returns false for valid token', () => {
    // Token expires in 5 minutes (epoch ms)
    const expiresAt = Date.now() + 5 * 60 * 1000
    expect(isAccessTokenExpired(expiresAt)).toBe(false)
  })

  it('returns true for token expiring within buffer period', () => {
    // Token expires in 20 seconds (less than 30 second default buffer)
    const expiresAt = Date.now() + 20 * 1000
    expect(isAccessTokenExpired(expiresAt)).toBe(true)
  })

  it('returns false for token expiring just outside buffer period', () => {
    // Token expires in 35 seconds (more than 30 second default buffer)
    const expiresAt = Date.now() + 35 * 1000
    expect(isAccessTokenExpired(expiresAt)).toBe(false)
  })

  it('respects custom buffer period', () => {
    // Token expires in 50 seconds (epoch ms)
    const expiresAt = Date.now() + 50 * 1000

    // With 60 second buffer, should be expired
    expect(isAccessTokenExpired(expiresAt, 60)).toBe(true)

    // With 30 second buffer, should be valid
    expect(isAccessTokenExpired(expiresAt, 30)).toBe(false)
  })
})

describe('ensureValidAccessToken', () => {
  let mockSaveCredentials: ReturnType<typeof vi.fn>

  // Helper to create a future timestamp (90 days from now) in epoch ms
  const futureRefreshExpiry = Date.now() + 90 * 24 * 60 * 60 * 1000

  beforeEach(() => {
    mockFetch.mockReset()
    mockSaveCredentials = vi.fn()
  })

  it('returns existing valid access token without making API call', async () => {
    // Token expires in 5 minutes (valid) - epoch ms
    const expiresAt = Date.now() + 5 * 60 * 1000

    const credentials: StoredCredentials = {
      refreshToken: 'refresh_123',
      refreshTokenExpiresAt: futureRefreshExpiry,
      userId: 'user_123',
      email: 'test@example.com',
      accessToken: 'existing_access_token',
      accessTokenExpiresAt: expiresAt,
      organizationId: 'org_123',
      pricingModelId: 'pm_456',
      livemode: false,
    }

    const result = await ensureValidAccessToken(
      'https://api.flowglad.com',
      credentials,
      mockSaveCredentials
    )

    expect(result).toBe('existing_access_token')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockSaveCredentials).not.toHaveBeenCalled()
  })

  it('requests new token when existing token is expired', async () => {
    // Token expired 1 minute ago - epoch ms
    const expiredAt = Date.now() - 60 * 1000
    // API returns ISO string, which gets converted to epoch ms
    const newExpiresAtIso = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString()
    const newExpiresAtEpoch = new Date(newExpiresAtIso).getTime()

    const credentials: StoredCredentials = {
      refreshToken: 'refresh_123',
      refreshTokenExpiresAt: futureRefreshExpiry,
      userId: 'user_123',
      email: 'test@example.com',
      accessToken: 'expired_token',
      accessTokenExpiresAt: expiredAt,
      organizationId: 'org_123',
      pricingModelId: 'pm_456',
      livemode: false,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'new_access_token',
          expiresAt: newExpiresAtIso,
        }),
    })

    const result = await ensureValidAccessToken(
      'https://api.flowglad.com',
      credentials,
      mockSaveCredentials
    )

    expect(result).toBe('new_access_token')
    expect(mockFetch).toHaveBeenCalled()
    // accessTokenExpiresAt is now stored as epoch ms (converted from ISO)
    expect(mockSaveCredentials).toHaveBeenCalledWith({
      ...credentials,
      accessToken: 'new_access_token',
      accessTokenExpiresAt: newExpiresAtEpoch,
    })
  })

  it('requests new token when no access token exists', async () => {
    const newExpiresAtIso = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString()

    const credentials: StoredCredentials = {
      refreshToken: 'refresh_123',
      refreshTokenExpiresAt: futureRefreshExpiry,
      userId: 'user_123',
      email: 'test@example.com',
      // No access token
      organizationId: 'org_123',
      pricingModelId: 'pm_456',
      livemode: false,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'new_access_token',
          expiresAt: newExpiresAtIso,
        }),
    })

    const result = await ensureValidAccessToken(
      'https://api.flowglad.com',
      credentials,
      mockSaveCredentials
    )

    expect(result).toBe('new_access_token')
    expect(mockFetch).toHaveBeenCalled()
  })

  it('throws error when no organization is linked', async () => {
    const credentials: StoredCredentials = {
      refreshToken: 'refresh_123',
      refreshTokenExpiresAt: futureRefreshExpiry,
      userId: 'user_123',
      email: 'test@example.com',
      // No org/PM linked
    }

    await expect(
      ensureValidAccessToken(
        'https://api.flowglad.com',
        credentials,
        mockSaveCredentials
      )
    ).rejects.toThrow('No organization or pricing model linked')
  })

  it('throws error when no pricing model is linked', async () => {
    const credentials: StoredCredentials = {
      refreshToken: 'refresh_123',
      refreshTokenExpiresAt: futureRefreshExpiry,
      userId: 'user_123',
      email: 'test@example.com',
      organizationId: 'org_123',
      // No pricingModelId
    }

    await expect(
      ensureValidAccessToken(
        'https://api.flowglad.com',
        credentials,
        mockSaveCredentials
      )
    ).rejects.toThrow('No organization or pricing model linked')
  })
})
