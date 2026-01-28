/**
 * Unkey SDK Mock
 *
 * Provides a working mock implementation of @unkey/api that returns
 * mock data instead of making real API calls.
 *
 * This mock is used by unit tests (via bun.mocks.ts) to allow testing
 * pure functions in @/utils/unkey without hitting a real API.
 *
 * Note: bun.db.mocks.ts blocks @unkey/api entirely for db tests,
 * and provides separate mocks for @/utils/unkey functions.
 */
import { type Mock, mock } from 'bun:test'

// Create mockable functions for Unkey operations
const mockDeleteApiKey =
  mock<(input: { keyId: string }) => Promise<{ data: object }>>()
mockDeleteApiKey.mockResolvedValue({ data: {} })

const mockCreateApiKey =
  mock<
    (input: {
      name?: string
      meta?: object
    }) => Promise<{ data: { keyId: string; key: string } }>
  >()
mockCreateApiKey.mockImplementation(async () => ({
  data: {
    keyId: `key_mock_${Math.random().toString(36).slice(2)}`,
    key: `sk_test_mock_${Math.random().toString(36).slice(2)}`,
  },
}))

const mockVerifyApiKey =
  mock<
    (input: { key: string }) => Promise<{
      data: { valid: boolean; ownerId: string; environment: string }
    }>
  >()
mockVerifyApiKey.mockResolvedValue({
  data: {
    valid: true,
    ownerId: 'mock_owner',
    environment: 'test',
  },
})

// Store mocks globally for tests that need to override behavior
declare global {
  // eslint-disable-next-line no-var
  var __mockDeleteApiKey: typeof mockDeleteApiKey
  // eslint-disable-next-line no-var
  var __mockCreateApiKey: typeof mockCreateApiKey
  // eslint-disable-next-line no-var
  var __mockVerifyApiKey: typeof mockVerifyApiKey
}
globalThis.__mockDeleteApiKey = mockDeleteApiKey
globalThis.__mockCreateApiKey = mockCreateApiKey
globalThis.__mockVerifyApiKey = mockVerifyApiKey

class MockUnkeyKeys {
  async createKey(input: { name?: string; meta?: object }) {
    return globalThis.__mockCreateApiKey(input)
  }

  async deleteKey(input: { keyId: string }) {
    return globalThis.__mockDeleteApiKey(input)
  }

  async verifyKey(input: { key: string }) {
    return globalThis.__mockVerifyApiKey(input)
  }
}

export class MockUnkey {
  keys = new MockUnkeyKeys()
}
