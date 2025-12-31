import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as backendCore from './backendCore'
import {
  createStripeOAuthCsrfToken,
  decodeStripeOAuthState,
  encodeStripeOAuthState,
  validateAndConsumeStripeOAuthCsrfToken,
} from './stripeOAuthState'

/**
 * In-memory Redis mock for testing CSRF token storage.
 * The default test mock in redis.ts returns null for get operations,
 * which doesn't allow us to test the full flow. This mock
 * provides actual storage/retrieval semantics.
 */
const mockRedisStore: Map<string, string> = new Map()

vi.mock('./redis', () => ({
  redis: () => ({
    get: vi.fn((key: string) => mockRedisStore.get(key) || null),
    set: vi.fn(
      (key: string, value: string, _options?: { ex?: number }) => {
        mockRedisStore.set(key, value)
        return 'OK'
      }
    ),
    del: vi.fn((key: string) => {
      const existed = mockRedisStore.has(key)
      mockRedisStore.delete(key)
      return existed ? 1 : 0
    }),
  }),
  RedisKeyNamespace: {
    StripeOAuthCsrfToken: 'stripeOAuthCsrfToken',
  },
}))

vi.mock('./backendCore', () => ({
  generateRandomBytes: vi.fn(
    () => 'mock-csrf-token-32-bytes-long-xx'
  ),
}))

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('stripeOAuthState', () => {
  beforeEach(() => {
    mockRedisStore.clear()
    vi.clearAllMocks()
  })

  describe('encodeStripeOAuthState', () => {
    it('encodes a CSRF token to base64', () => {
      const token = 'test-csrf-token'
      const encoded = encodeStripeOAuthState(token)

      expect(encoded).toBe(
        Buffer.from(token, 'utf8').toString('base64')
      )
    })

    it('produces URL-safe output', () => {
      const token = 'token-with-special+chars/=test'
      const encoded = encodeStripeOAuthState(token)

      // Base64 output should only contain alphanumeric, +, /, =
      expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/)
    })
  })

  describe('decodeStripeOAuthState', () => {
    it('decodes a base64-encoded state parameter', () => {
      const token = 'test-csrf-token'
      const encoded = Buffer.from(token, 'utf8').toString('base64')

      const decoded = decodeStripeOAuthState(encoded)
      expect(decoded).toBe(token)
    })

    it('handles URL-encoded state parameters', () => {
      const token = 'test-csrf-token'
      const encoded = Buffer.from(token, 'utf8').toString('base64')
      // URL encode the base64 string (simulating what might come from URL params)
      const urlEncoded = encodeURIComponent(encoded)

      const decoded = decodeStripeOAuthState(urlEncoded)
      expect(decoded).toBe(token)
    })

    it('roundtrips with encodeStripeOAuthState', () => {
      const originalToken = 'my-secret-csrf-token-12345'
      const encoded = encodeStripeOAuthState(originalToken)
      const decoded = decodeStripeOAuthState(encoded)

      expect(decoded).toBe(originalToken)
    })

    it('throws on invalid base64 input', () => {
      // This is not a valid base64 string
      const invalidState = '%%%invalid%%%'

      expect(() => decodeStripeOAuthState(invalidState)).toThrow(
        'Invalid OAuth state parameter'
      )
    })
  })

  describe('createStripeOAuthCsrfToken', () => {
    it('creates a token and stores it in Redis', async () => {
      const userId = 'user-123'
      const organizationId = 'org-456'

      const token = await createStripeOAuthCsrfToken({
        userId,
        organizationId,
      })

      // Token should be returned (from our mock)
      expect(token).toBe('mock-csrf-token-32-bytes-long-xx')

      // Verify data was stored in Redis
      const storedData = mockRedisStore.get(
        `stripeOAuthCsrfToken:${token}`
      )
      expect(storedData).toBeDefined()

      const parsedData = JSON.parse(storedData!)
      expect(parsedData.userId).toBe(userId)
      expect(parsedData.organizationId).toBe(organizationId)
      expect(parsedData.createdAt).toBeDefined()
    })

    it('stores createdAt timestamp in ISO format', async () => {
      const token = await createStripeOAuthCsrfToken({
        userId: 'user-123',
        organizationId: 'org-456',
      })

      const storedData = mockRedisStore.get(
        `stripeOAuthCsrfToken:${token}`
      )
      const parsedData = JSON.parse(storedData!)

      // Verify createdAt is a valid ISO datetime string
      const parsedDate = new Date(parsedData.createdAt)
      expect(parsedDate.toISOString()).toBe(parsedData.createdAt)
    })
  })

  describe('validateAndConsumeStripeOAuthCsrfToken', () => {
    const userId = 'user-123'
    const organizationId = 'org-456'
    const testToken = 'test-csrf-token'

    beforeEach(() => {
      // Pre-populate Redis with a valid token
      const tokenData = {
        userId,
        organizationId,
        createdAt: new Date().toISOString(),
      }
      mockRedisStore.set(
        `stripeOAuthCsrfToken:${testToken}`,
        JSON.stringify(tokenData)
      )
    })

    it('validates and returns organizationId for valid token and user', async () => {
      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: testToken,
        expectedUserId: userId,
      })

      expect(result).toEqual({ organizationId })
    })

    it('deletes the token after validation (single-use)', async () => {
      // Token exists before validation
      expect(
        mockRedisStore.has(`stripeOAuthCsrfToken:${testToken}`)
      ).toBe(true)

      await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: testToken,
        expectedUserId: userId,
      })

      // Token should be deleted after validation
      expect(
        mockRedisStore.has(`stripeOAuthCsrfToken:${testToken}`)
      ).toBe(false)
    })

    it('returns null for non-existent token', async () => {
      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: 'non-existent-token',
        expectedUserId: userId,
      })

      expect(result).toBeNull()
    })

    it('returns null and deletes token when user ID does not match', async () => {
      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: testToken,
        expectedUserId: 'different-user',
      })

      expect(result).toBeNull()
      // Token should still be deleted (prevent reuse attempts)
      expect(
        mockRedisStore.has(`stripeOAuthCsrfToken:${testToken}`)
      ).toBe(false)
    })

    it('returns null for invalid token data format', async () => {
      // Store invalid data
      mockRedisStore.set(
        `stripeOAuthCsrfToken:invalid-token`,
        JSON.stringify({ invalid: 'data' })
      )

      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: 'invalid-token',
        expectedUserId: userId,
      })

      expect(result).toBeNull()
    })

    it('returns null when token data is missing required fields', async () => {
      // Store data missing organizationId
      mockRedisStore.set(
        `stripeOAuthCsrfToken:incomplete-token`,
        JSON.stringify({
          userId: 'user-123',
          // missing organizationId and createdAt
        })
      )

      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: 'incomplete-token',
        expectedUserId: 'user-123',
      })

      expect(result).toBeNull()
    })

    it('cannot reuse the same token twice', async () => {
      // First validation should succeed
      const firstResult =
        await validateAndConsumeStripeOAuthCsrfToken({
          csrfToken: testToken,
          expectedUserId: userId,
        })
      expect(firstResult).toEqual({ organizationId })

      // Second validation should fail (token already consumed)
      const secondResult =
        await validateAndConsumeStripeOAuthCsrfToken({
          csrfToken: testToken,
          expectedUserId: userId,
        })
      expect(secondResult).toBeNull()
    })

    it('handles Redis returning object instead of string', async () => {
      // Some Redis clients return parsed objects directly
      const tokenData = {
        userId,
        organizationId,
        createdAt: new Date().toISOString(),
      }

      // Store as object (simulating Redis auto-parse behavior)
      mockRedisStore.set(
        `stripeOAuthCsrfToken:object-token`,
        tokenData as unknown as string
      )

      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: 'object-token',
        expectedUserId: userId,
      })

      // Should handle this case gracefully
      // Note: The implementation does handle this via typeof check
      expect(result).toEqual({ organizationId })
    })
  })

  describe('full OAuth flow integration', () => {
    beforeEach(() => {
      // Reset the mock to generate predictable tokens
      vi.mocked(backendCore.generateRandomBytes).mockReturnValue(
        'flow-test-token-abc123'
      )
    })

    it('completes full create-encode-decode-validate flow', async () => {
      const userId = 'user-flow-test'
      const organizationId = 'org-flow-test'

      // Step 1: Create CSRF token
      const csrfToken = await createStripeOAuthCsrfToken({
        userId,
        organizationId,
      })

      // Step 2: Encode for URL state parameter
      const state = encodeStripeOAuthState(csrfToken)

      // Step 3: Decode from URL state parameter (simulating callback)
      const decodedToken = decodeStripeOAuthState(state)
      expect(decodedToken).toBe(csrfToken)

      // Step 4: Validate and consume
      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: decodedToken,
        expectedUserId: userId,
      })

      expect(result).toEqual({ organizationId })
    })

    it('prevents CSRF attack with wrong user', async () => {
      const legitimateUserId = 'legitimate-user'
      const attackerUserId = 'attacker-user'
      const organizationId = 'target-org'

      // Legitimate user creates a token
      const csrfToken = await createStripeOAuthCsrfToken({
        userId: legitimateUserId,
        organizationId,
      })

      const state = encodeStripeOAuthState(csrfToken)
      const decodedToken = decodeStripeOAuthState(state)

      // Attacker tries to use the token (different user session)
      const result = await validateAndConsumeStripeOAuthCsrfToken({
        csrfToken: decodedToken,
        expectedUserId: attackerUserId,
      })

      // Should fail - user mismatch
      expect(result).toBeNull()
    })
  })
})
