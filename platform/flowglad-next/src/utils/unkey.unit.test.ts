import { afterEach, describe, expect, it } from 'bun:test'
import { FlowgladApiKeyType } from '@db-core/enums'
import type { ApiKey } from '@db-core/schema/apiKeys'
import type { Organization } from '@db-core/schema/organizations'
import {
  parseUnkeyMeta,
  type StandardCreateApiKeyParams,
  secretApiKeyInputToUnkeyInput,
  unkey,
} from './unkey'

describe('unkey client configuration', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore original env
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    })
    Object.assign(process.env, originalEnv)
  })

  it('returns an Unkey client with expected API (keys property)', () => {
    // Note: In test mode, @unkey/api is mocked with MockUnkey
    // so we can't use instanceof Unkey. We verify the API shape instead.
    const client = unkey()
    expect(typeof client).toBe('object')
    expect(typeof client.keys).toBe('object')
    expect(typeof client.keys.createKey).toBe('function')
    expect(typeof client.keys.deleteKey).toBe('function')
  })

  it('creates client without error when UNKEY_MOCK_HOST is set', () => {
    // Set UNKEY_MOCK_HOST to simulate docker-compose test configuration
    process.env.UNKEY_MOCK_HOST = 'http://localhost:9002'
    const client = unkey()
    expect(typeof client).toBe('object')
    expect(typeof client.keys).toBe('object')
  })

  it('creates client without error when UNKEY_MOCK_HOST is unset', () => {
    delete process.env.UNKEY_MOCK_HOST
    const client = unkey()
    // Client created without mock server config (uses real Unkey API)
    expect(typeof client).toBe('object')
    expect(typeof client.keys).toBe('object')
  })
})

describe('secretApiKeyInputToUnkeyInput', () => {
  const mockOrganization: Pick<Organization.Record, 'id'> = {
    id: 'org_123',
  }

  const mockParams: StandardCreateApiKeyParams = {
    name: 'Test Key',
    apiEnvironment: 'test' as const,
    organization: mockOrganization,
    userId: 'user_123',
    type: FlowgladApiKeyType.Secret,
    expiresAt: new Date('2024-01-01'),
    pricingModelId: 'pricing_model_Ab3XyZ123',
  }

  it('should set correct metadata including pricingModelId', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    const expectedMeta: ApiKey.ApiKeyMetadata = {
      userId: 'user_123',
      type: FlowgladApiKeyType.Secret,
      pricingModelId: 'pricing_model_Ab3XyZ123',
    }
    expect(result.meta).toEqual(expectedMeta)
  })

  it('should set correct externalId', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.externalId).toBe('org_123')
  })

  it('should format name correctly with pricingModelId', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.name).toBe(
      'org_123 / test / pricing_model_Ab3XyZ123 / Test Key'
    )
  })

  it('should set correct prefix with environment and PM ID suffix', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    // In non-prod (test), prefix should be: stg_sk_test_Ab3X
    expect(result.prefix).toContain('test')
    expect(result.prefix).toContain('Ab3X')
  })

  it('should set correct expiration', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.expires).toBe(new Date('2024-01-01').getTime())
  })
})

describe('parseUnkeyMeta', () => {
  it('should parse well-formed secret metadata with pricingModelId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.Secret,
      userId: 'user_123',
      organizationId: 'org_456',
      pricingModelId: 'pricing_model_abc123',
    }
    const result = parseUnkeyMeta(rawMeta)

    expect(result).toEqual({
      type: FlowgladApiKeyType.Secret,
      userId: 'user_123',
      organizationId: 'org_456',
      pricingModelId: 'pricing_model_abc123',
    })
  })

  it('should parse well-formed CliSession metadata with pricingModelId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.CliSession,
      userId: 'user_123',
      organizationId: 'org_456',
      pricingModelId: 'pricing_model_abc123',
    }
    const result = parseUnkeyMeta(rawMeta)

    expect(result).toEqual({
      type: FlowgladApiKeyType.CliSession,
      userId: 'user_123',
      organizationId: 'org_456',
      pricingModelId: 'pricing_model_abc123',
    })
  })

  it('should throw error for CliSession metadata missing organizationId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.CliSession,
      userId: 'user_123',
      pricingModelId: 'pricing_model_abc123',
      // Missing organizationId - required for CliSession
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })

  it('should throw error for metadata missing pricingModelId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.Secret,
      userId: 'user_123',
      organizationId: 'org_456',
      // Missing pricingModelId
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })

  it('should throw error for malformed secret metadata with missing userId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.Secret,
      // Missing userId
      organizationId: 'org_456',
      pricingModelId: 'pricing_model_abc123',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })

  it('should throw error for metadata with invalid type value', () => {
    const rawMeta = {
      type: 'invalid_type',
      userId: 'user_123',
      pricingModelId: 'pricing_model_abc123',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      `Invalid unkey metadata. Received metadata with type ${rawMeta.type} but expected type ${FlowgladApiKeyType.Secret} or ${FlowgladApiKeyType.CliSession}`
    )
  })

  it('should throw error for completely malformed metadata', () => {
    const rawMeta = {
      someRandomField: 'value',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })

  it('should throw error for metadata with only userId (missing pricingModelId)', () => {
    const rawMeta = {
      userId: 'user______lE',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })
})
