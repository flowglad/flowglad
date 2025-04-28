import { describe, expect, it } from 'vitest'
import {
  secretApiKeyInputToUnkeyInput,
  billingPortalApiKeyInputToUnkeyInput,
  BillingPortalCreateApiKeyParams,
  StandardCreateApiKeyParams,
  parseUnkeyMeta,
} from './unkey'
import { FlowgladApiKeyType } from '@/types'
import { Organization } from '@/db/schema/organizations'
import { ApiKey } from '@/db/schema/apiKeys'

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
  }

  it('should set correct metadata', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    const expectedMeta: ApiKey.ApiKeyMetadata = {
      userId: 'user_123',
      type: FlowgladApiKeyType.Secret,
    }
    expect(result.meta).toEqual(expectedMeta)
  })

  it('should set correct externalId', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.externalId).toBe('org_123')
  })

  it('should format name correctly', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.name).toBe('org_123 / test / Test Key')
  })

  it('should set correct environment', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.environment).toBe('test')
  })

  it('should set correct expiration', () => {
    const result = secretApiKeyInputToUnkeyInput(mockParams)
    expect(result.expires).toBe(new Date('2024-01-01').getTime())
  })
})

describe('billingPortalApiKeyInputToUnkeyInput', () => {
  const mockOrganization: Pick<Organization.Record, 'id'> = {
    id: 'org_123',
  }

  const mockParams: BillingPortalCreateApiKeyParams = {
    name: 'Test Key',
    apiEnvironment: 'test' as const,
    organization: mockOrganization,
    userId: 'user_123',
    type: FlowgladApiKeyType.BillingPortalToken,
    stackAuthHostedBillingUserId: 'billing_123',
    expiresAt: new Date('2024-01-01'),
  }

  it('should set correct metadata', () => {
    const result = billingPortalApiKeyInputToUnkeyInput(mockParams)
    const expectedMeta: ApiKey.BillingPortalMetadata = {
      stackAuthHostedBillingUserId: 'billing_123',
      type: FlowgladApiKeyType.BillingPortalToken,
      organizationId: mockOrganization.id,
    }
    expect(result.meta).toEqual(expectedMeta)
  })

  it('should set correct externalId', () => {
    const result = billingPortalApiKeyInputToUnkeyInput(mockParams)
    expect(result.externalId).toBe(mockOrganization.id)
  })

  it('should format name correctly', () => {
    const result = billingPortalApiKeyInputToUnkeyInput(mockParams)
    expect(result.name).toBe('org_123 / test / Test Key')
  })

  it('should set correct environment', () => {
    const result = billingPortalApiKeyInputToUnkeyInput(mockParams)
    expect(result.environment).toBe('test')
  })

  it('should set correct expiration', () => {
    const result = billingPortalApiKeyInputToUnkeyInput(mockParams)
    expect(result.expires).toBe(new Date('2024-01-01').getTime())
  })
})

describe('parseUnkeyMeta', () => {
  it('should parse metadata with just userId and return it as secret type', () => {
    const rawMeta = { userId: 'abcdefg' }
    const result = parseUnkeyMeta(rawMeta)

    expect(result).toEqual({
      userId: 'abcdefg',
      type: FlowgladApiKeyType.Secret,
    })
  })

  it('should parse well-formed secret metadata', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.Secret,
      userId: 'user_123',
      organizationId: 'org_456',
    }
    const result = parseUnkeyMeta(rawMeta)

    expect(result).toEqual({
      type: FlowgladApiKeyType.Secret,
      userId: 'user_123',
      organizationId: 'org_456',
    })
  })

  it('should parse well-formed billing portal metadata', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.BillingPortalToken,
      stackAuthHostedBillingUserId: 'billing_123',
      organizationId: 'org_456',
    }
    const result = parseUnkeyMeta(rawMeta)

    expect(result).toEqual({
      type: FlowgladApiKeyType.BillingPortalToken,
      stackAuthHostedBillingUserId: 'billing_123',
      organizationId: 'org_456',
    })
  })

  it('should throw error for malformed secret metadata with missing userId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.Secret,
      // Missing userId
      organizationId: 'org_456',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })

  it('should throw error for malformed billing portal metadata with missing stackAuthHostedBillingUserId', () => {
    const rawMeta = {
      type: FlowgladApiKeyType.BillingPortalToken,
      // Missing stackAuthHostedBillingUserId
      organizationId: 'org_456',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      'Invalid unkey metadata'
    )
  })

  it('should throw error for metadata with invalid type value', () => {
    const rawMeta = {
      type: 'invalid_type',
      userId: 'user_123',
    }

    expect(() => parseUnkeyMeta(rawMeta)).toThrow(
      `Invalid unkey metadata. Received metadata with type ${rawMeta.type} but expected type ${FlowgladApiKeyType.Secret}`
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
  it('should succeed for metadata with only userId', () => {
    const rawMeta = {
      userId: 'user______lE',
    }

    expect(() => parseUnkeyMeta(rawMeta)).not.toThrow()
    expect(parseUnkeyMeta(rawMeta)).toEqual({
      type: FlowgladApiKeyType.Secret,
      userId: rawMeta.userId,
    })
  })
})
