/**
 * Unkey Utils Mock for DB Tests
 *
 * Mocks @/utils/unkey to prevent loading the blocked @unkey/api SDK.
 * Provides working mock implementations for db tests.
 *
 * This is separate from unkey-sdk-mock.ts because:
 * - Unit tests use the SDK mock (MockUnkey) with real @/utils/unkey functions
 * - DB tests use this module mock to avoid the blocked SDK
 */
import { mock } from 'bun:test'

const mockCreateSecretApiKey =
  mock<
    (params: {
      name: string
      apiEnvironment: 'live' | 'test'
      organization: { id: string }
      userId: string
      type: 'secret'
      pricingModelId: string
      expiresAt?: Date | number
    }) => Promise<{
      apiKeyInsert: {
        organizationId: string
        pricingModelId: string
        name: string
        token: string
        livemode: boolean
        active: boolean
        unkeyId: string
        type: 'secret'
        expiresAt?: number
        hashText: string
      }
      shownOnlyOnceKey: string
    }>
  >()
mockCreateSecretApiKey.mockImplementation(async (params) => {
  const mockKey = `sk_${params.apiEnvironment}_mock_${Math.random().toString(36).slice(2)}`
  const livemode = params.apiEnvironment === 'live'
  return {
    apiKeyInsert: {
      organizationId: params.organization.id,
      pricingModelId: params.pricingModelId,
      name: params.name,
      token: livemode ? `sk_live_...${mockKey.slice(-4)}` : mockKey,
      livemode,
      active: true,
      unkeyId: `key_mock_${Math.random().toString(36).slice(2)}`,
      type: 'secret' as const,
      expiresAt: params.expiresAt
        ? new Date(params.expiresAt).getTime()
        : undefined,
      hashText: `hash_mock_${Math.random().toString(36).slice(2)}`,
    },
    shownOnlyOnceKey: mockKey,
  }
})

const mockUnkeyDeleteApiKey = mock<(keyId: string) => Promise<void>>()
mockUnkeyDeleteApiKey.mockResolvedValue(undefined)

const mockUnkeyUtilVerifyApiKey =
  mock<
    (apiKey: string) => Promise<{
      result:
        | {
            valid: boolean
            ownerId?: string
            environment?: string
            code?: string
          }
        | undefined
      error: unknown | undefined
    }>
  >()
mockUnkeyUtilVerifyApiKey.mockResolvedValue({
  result: {
    valid: true,
    ownerId: 'mock_owner',
    environment: 'test',
  },
  error: undefined,
})

const mockReplaceSecretApiKey =
  mock<
    (params: {
      organization: { id: string }
      oldApiKey: {
        name: string
        livemode: boolean
        type: string
        expiresAt?: number | null
        pricingModelId: string
      }
      userId: string
    }) => Promise<{
      apiKeyInsert: {
        organizationId: string
        pricingModelId: string
        name: string
        token: string
        livemode: boolean
        active: boolean
        unkeyId: string
        type: 'secret'
        expiresAt?: number
        hashText: string
      }
      shownOnlyOnceKey: string
    }>
  >()
mockReplaceSecretApiKey.mockImplementation(async (params) => {
  const apiEnvironment = params.oldApiKey.livemode ? 'live' : 'test'
  const mockKey = `sk_${apiEnvironment}_mock_${Math.random().toString(36).slice(2)}`
  return {
    apiKeyInsert: {
      organizationId: params.organization.id,
      pricingModelId: params.oldApiKey.pricingModelId,
      name: params.oldApiKey.name,
      token: params.oldApiKey.livemode
        ? `sk_live_...${mockKey.slice(-4)}`
        : mockKey,
      livemode: params.oldApiKey.livemode,
      active: true,
      unkeyId: `key_mock_${Math.random().toString(36).slice(2)}`,
      type: 'secret' as const,
      expiresAt: params.oldApiKey.expiresAt ?? undefined,
      hashText: `hash_mock_${Math.random().toString(36).slice(2)}`,
    },
    shownOnlyOnceKey: mockKey,
  }
})

// Store mocks globally for tests that need to override behavior
declare global {
  // eslint-disable-next-line no-var
  var __mockCreateSecretApiKey: typeof mockCreateSecretApiKey
  // eslint-disable-next-line no-var
  var __mockUnkeyDeleteApiKey: typeof mockUnkeyDeleteApiKey
  // eslint-disable-next-line no-var
  var __mockUnkeyVerifyApiKey: typeof mockUnkeyUtilVerifyApiKey
  // eslint-disable-next-line no-var
  var __mockReplaceSecretApiKey: typeof mockReplaceSecretApiKey
}
globalThis.__mockCreateSecretApiKey = mockCreateSecretApiKey
globalThis.__mockUnkeyDeleteApiKey = mockUnkeyDeleteApiKey
globalThis.__mockUnkeyVerifyApiKey = mockUnkeyUtilVerifyApiKey
globalThis.__mockReplaceSecretApiKey = mockReplaceSecretApiKey

export const unkeyUtilsMockExports = {
  createSecretApiKey: mockCreateSecretApiKey,
  deleteApiKey: mockUnkeyDeleteApiKey,
  verifyApiKey: mockUnkeyUtilVerifyApiKey,
  replaceSecretApiKey: mockReplaceSecretApiKey,
  // Pure functions that don't need the SDK - re-implement inline
  secretApiKeyInputToUnkeyInput: (params: {
    name: string
    apiEnvironment: 'live' | 'test'
    organization: { id: string }
    userId: string
    type: 'secret'
    pricingModelId: string
    expiresAt?: Date | number
  }) => ({
    apiId: 'mock_api_id',
    name: `${params.organization.id} / ${params.apiEnvironment} / ${params.pricingModelId} / ${params.name}`,
    expires: params.expiresAt
      ? new Date(params.expiresAt).getTime()
      : undefined,
    externalId: params.organization.id,
    prefix: `sk_${params.apiEnvironment}_${params.pricingModelId.replace('pricing_model_', '').slice(0, 4)}`,
    meta: {
      userId: params.userId,
      type: 'secret',
      pricingModelId: params.pricingModelId,
    },
  }),
  parseUnkeyMeta: (rawUnkeyMeta?: object) => {
    if (!rawUnkeyMeta) {
      throw new Error('No unkey metadata provided')
    }
    const meta = rawUnkeyMeta as { userId?: string; type?: string }
    if (meta.type && meta.type !== 'secret') {
      throw new Error(`Invalid unkey metadata type: ${meta.type}`)
    }
    return { userId: meta.userId, type: 'secret' as const }
  },
  // Block direct unkey() access
  unkey: () => {
    throw new Error(
      '[Test] Direct Unkey client access is blocked. Use the mocked functions instead.'
    )
  },
}
