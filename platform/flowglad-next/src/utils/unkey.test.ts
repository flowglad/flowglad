import { describe, expect, it } from 'vitest'
import {
  secretApiKeyInputToUnkeyInput,
  billingPortalApiKeyInputToUnkeyInput,
  BillingPortalCreateApiKeyParams,
  StandardCreateApiKeyParams,
} from './unkey'
import { FlowgladApiKeyType } from '@/types'
import { Organization } from '@/db/schema/organizations'

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

    expect(result.meta).toEqual({
      userId: 'user_123',
      keyType: FlowgladApiKeyType.Secret,
    })
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

    expect(result.meta).toEqual({
      userId: 'user_123',
      keyType: FlowgladApiKeyType.BillingPortalToken,
    })
  })

  it('should set correct externalId', () => {
    const result = billingPortalApiKeyInputToUnkeyInput(mockParams)
    expect(result.externalId).toBe('billing_123')
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
