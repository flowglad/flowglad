import { beforeEach, describe, expect, it, mock } from 'bun:test'

/**
 * In-memory Redis mock for testing CSRF token storage.
 */
const mockRedisStore: Map<string, string> = new Map()

const mockGenerateRandomBytes = mock(
  () => 'mock-csrf-token-32-bytes-long-xx'
)

mock.module('./redis', () => ({
  redis: () => ({
    get: mock((key: string) => mockRedisStore.get(key) || null),
    getdel: mock((key: string) => {
      const value = mockRedisStore.get(key) || null
      mockRedisStore.delete(key)
      return value
    }),
    set: mock(
      (key: string, value: string, _options?: { ex?: number }) => {
        mockRedisStore.set(key, value)
        return 'OK'
      }
    ),
    del: mock((key: string) => {
      const existed = mockRedisStore.has(key)
      mockRedisStore.delete(key)
      return existed ? 1 : 0
    }),
  }),
  RedisKeyNamespace: {
    DiscordOAuthCsrfToken: 'discordOAuthCsrfToken',
  },
}))

mock.module('./backendCore', () => ({
  generateRandomBytes: mockGenerateRandomBytes,
}))

mock.module('./logger', () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}))

import {
  createDiscordOAuthCsrfToken,
  decodeDiscordOAuthState,
  encodeDiscordOAuthState,
  validateAndConsumeDiscordOAuthCsrfToken,
} from './discordOAuthState'

describe('discordOAuthState', () => {
  beforeEach(() => {
    mockRedisStore.clear()
    mockGenerateRandomBytes.mockReset()
    mockGenerateRandomBytes.mockImplementation(
      () => 'mock-csrf-token-32-bytes-long-xx'
    )
  })

  describe('encodeDiscordOAuthState', () => {
    it('encodes a CSRF token to base64', () => {
      const token = 'test-csrf-token'
      const encoded = encodeDiscordOAuthState(token)

      expect(encoded).toBe(
        Buffer.from(token, 'utf8').toString('base64')
      )
    })

    it('produces URL-safe output', () => {
      const token = 'token-with-special+chars/=test'
      const encoded = encodeDiscordOAuthState(token)

      expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
  })

  describe('decodeDiscordOAuthState', () => {
    it('decodes a base64-encoded state parameter', () => {
      const token = 'test-csrf-token'
      const encoded = Buffer.from(token, 'utf8').toString('base64')

      const decoded = decodeDiscordOAuthState(encoded)
      expect(decoded).toBe(token)
    })

    it('handles URL-encoded state parameters', () => {
      const token = 'test-csrf-token'
      const encoded = Buffer.from(token, 'utf8').toString('base64')
      const urlEncoded = encodeURIComponent(encoded)

      const decoded = decodeDiscordOAuthState(urlEncoded)
      expect(decoded).toBe(token)
    })

    it('roundtrips with encodeDiscordOAuthState', () => {
      const originalToken = 'my-secret-csrf-token-12345'
      const encoded = encodeDiscordOAuthState(originalToken)
      const decoded = decodeDiscordOAuthState(encoded)

      expect(decoded).toBe(originalToken)
    })

    it('throws on invalid base64 input', () => {
      const invalidState = '%%%invalid%%%'

      expect(() => decodeDiscordOAuthState(invalidState)).toThrow(
        'Invalid OAuth state parameter'
      )
    })
  })

  describe('createDiscordOAuthCsrfToken', () => {
    it('creates a token and stores it in Redis with userId, organizationId, and channelId', async () => {
      const userId = 'user-123'
      const organizationId = 'org-456'
      const channelId = 'channel-789'

      const token = await createDiscordOAuthCsrfToken({
        userId,
        organizationId,
        channelId,
      })

      expect(token).toBe('mock-csrf-token-32-bytes-long-xx')

      const storedData = mockRedisStore.get(
        `discordOAuthCsrfToken:${token}`
      )

      const parsedData = JSON.parse(storedData!)
      expect(parsedData.userId).toBe(userId)
      expect(parsedData.organizationId).toBe(organizationId)
      expect(parsedData.channelId).toBe(channelId)
      expect(typeof parsedData.createdAt).toBe('string')
    })

    it('stores createdAt timestamp in ISO format', async () => {
      const token = await createDiscordOAuthCsrfToken({
        userId: 'user-123',
        organizationId: 'org-456',
        channelId: 'channel-789',
      })

      const storedData = mockRedisStore.get(
        `discordOAuthCsrfToken:${token}`
      )
      const parsedData = JSON.parse(storedData!)

      const parsedDate = new Date(parsedData.createdAt)
      expect(parsedDate.toISOString()).toBe(parsedData.createdAt)
    })
  })

  describe('validateAndConsumeDiscordOAuthCsrfToken', () => {
    const userId = 'user-123'
    const organizationId = 'org-456'
    const channelId = 'channel-789'
    const testToken = 'test-csrf-token'

    beforeEach(() => {
      const tokenData = {
        userId,
        organizationId,
        channelId,
        createdAt: new Date().toISOString(),
      }
      mockRedisStore.set(
        `discordOAuthCsrfToken:${testToken}`,
        JSON.stringify(tokenData)
      )
    })

    it('validates and returns organizationId and channelId for valid token and user', async () => {
      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: testToken,
        expectedUserId: userId,
      })

      expect(result).toEqual({ organizationId, channelId })
    })

    it('deletes the token after validation (single-use)', async () => {
      expect(
        mockRedisStore.has(`discordOAuthCsrfToken:${testToken}`)
      ).toBe(true)

      await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: testToken,
        expectedUserId: userId,
      })

      expect(
        mockRedisStore.has(`discordOAuthCsrfToken:${testToken}`)
      ).toBe(false)
    })

    it('returns null for non-existent token', async () => {
      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: 'non-existent-token',
        expectedUserId: userId,
      })

      expect(result).toBeNull()
    })

    it('returns null and deletes token when user ID does not match', async () => {
      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: testToken,
        expectedUserId: 'different-user',
      })

      expect(result).toBeNull()
      expect(
        mockRedisStore.has(`discordOAuthCsrfToken:${testToken}`)
      ).toBe(false)
    })

    it('returns null for invalid token data format', async () => {
      mockRedisStore.set(
        `discordOAuthCsrfToken:invalid-token`,
        JSON.stringify({ invalid: 'data' })
      )

      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: 'invalid-token',
        expectedUserId: userId,
      })

      expect(result).toBeNull()
    })

    it('returns null when token data is missing required fields', async () => {
      mockRedisStore.set(
        `discordOAuthCsrfToken:incomplete-token`,
        JSON.stringify({
          userId: 'user-123',
          organizationId: 'org-456',
          // missing channelId and createdAt
        })
      )

      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: 'incomplete-token',
        expectedUserId: 'user-123',
      })

      expect(result).toBeNull()
    })

    it('cannot reuse the same token twice', async () => {
      const firstResult =
        await validateAndConsumeDiscordOAuthCsrfToken({
          csrfToken: testToken,
          expectedUserId: userId,
        })
      expect(firstResult).toEqual({ organizationId, channelId })

      const secondResult =
        await validateAndConsumeDiscordOAuthCsrfToken({
          csrfToken: testToken,
          expectedUserId: userId,
        })
      expect(secondResult).toBeNull()
    })

    it('handles Redis returning object instead of string', async () => {
      const tokenData = {
        userId,
        organizationId,
        channelId,
        createdAt: new Date().toISOString(),
      }

      mockRedisStore.set(
        `discordOAuthCsrfToken:object-token`,
        tokenData as unknown as string
      )

      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: 'object-token',
        expectedUserId: userId,
      })

      expect(result).toEqual({ organizationId, channelId })
    })
  })

  describe('full OAuth flow integration', () => {
    beforeEach(() => {
      mockGenerateRandomBytes.mockReturnValue(
        'flow-test-token-abc123'
      )
    })

    it('completes full create-encode-decode-validate flow', async () => {
      const userId = 'user-flow-test'
      const organizationId = 'org-flow-test'
      const channelId = 'channel-flow-test'

      const csrfToken = await createDiscordOAuthCsrfToken({
        userId,
        organizationId,
        channelId,
      })

      const state = encodeDiscordOAuthState(csrfToken)

      const decodedToken = decodeDiscordOAuthState(state)
      expect(decodedToken).toBe(csrfToken)

      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: decodedToken,
        expectedUserId: userId,
      })

      expect(result).toEqual({ organizationId, channelId })
    })

    it('prevents CSRF attack with wrong user', async () => {
      const legitimateUserId = 'legitimate-user'
      const attackerUserId = 'attacker-user'
      const organizationId = 'target-org'
      const channelId = 'target-channel'

      const csrfToken = await createDiscordOAuthCsrfToken({
        userId: legitimateUserId,
        organizationId,
        channelId,
      })

      const state = encodeDiscordOAuthState(csrfToken)
      const decodedToken = decodeDiscordOAuthState(state)

      const result = await validateAndConsumeDiscordOAuthCsrfToken({
        csrfToken: decodedToken,
        expectedUserId: attackerUserId,
      })

      expect(result).toBeNull()
    })
  })
})
