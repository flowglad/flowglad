import { describe, it, expect } from 'vitest'
import {
  setApiKeyOnServerMetadata,
  setCustomerExternalIdOnServerMetadata,
} from './hostedBillingApiHelpers'

describe('setApiKeyOnServerMetadata', () => {
  const organizationId = 'org_123'
  const existingServerMetadata = {
    otherData: 'should remain untouched',
    billingPortalMetadata: {
      other_org: {
        apiKey: 'other_key',
      },
    },
  }

  it('should set undefined apiKey', () => {
    const result = setApiKeyOnServerMetadata({
      existingServerMetadata,
      organizationId,
      apiKey: undefined,
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: undefined },
      },
    })
  })

  it('should set new apiKey', () => {
    const result = setApiKeyOnServerMetadata({
      existingServerMetadata,
      organizationId,
      apiKey: 'new_key',
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: 'new_key' },
      },
    })
  })

  it('should override undefined apiKey with new value', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: undefined },
      },
    }

    const result = setApiKeyOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      apiKey: 'new_key',
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: 'new_key' },
      },
    })
  })

  it('should override existing apiKey with undefined', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: 'existing_key' },
      },
    }

    const result = setApiKeyOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      apiKey: undefined,
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: undefined },
      },
    })
  })

  it('should preserve other metadata structure', () => {
    const complexMetadata = {
      otherData: 'value',
      nestedData: {
        key: 'value',
      },
      billingPortalMetadata: {
        other_org: {
          apiKey: 'other_key',
          otherField: 'value',
        },
      },
    }

    const result = setApiKeyOnServerMetadata({
      existingServerMetadata: complexMetadata,
      organizationId,
      apiKey: 'new_key',
    })

    expect(result).toEqual({
      ...complexMetadata,
      billingPortalMetadata: {
        ...complexMetadata.billingPortalMetadata,
        [organizationId]: { apiKey: 'new_key' },
      },
    })
  })

  it('should preserve customerExternalId when setting apiKey', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'existing_key',
          customerExternalId: 'existing_id',
        },
      },
    }

    const result = setApiKeyOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      apiKey: 'new_key',
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'new_key',
          customerExternalId: 'existing_id',
        },
      },
    })
  })
})

describe('setCustomerExternalIdOnServerMetadata', () => {
  const organizationId = 'org_123'
  const existingServerMetadata = {
    otherData: 'should remain untouched',
    billingPortalMetadata: {
      other_org: {
        customerExternalId: 'other_id',
      },
    },
  }

  it('should set undefined customerExternalId', () => {
    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata,
      organizationId,
      customerExternalId: undefined,
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: undefined },
      },
    })
  })

  it('should set new customerExternalId', () => {
    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata,
      organizationId,
      customerExternalId: 'new_id',
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: 'new_id' },
      },
    })
  })

  it('should override undefined customerExternalId with new value', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: undefined },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      customerExternalId: 'new_id',
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: 'new_id' },
      },
    })
  })

  it('should override existing customerExternalId with undefined', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: 'existing_id' },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      customerExternalId: undefined,
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: undefined },
      },
    })
  })

  it('should preserve other metadata structure', () => {
    const complexMetadata = {
      otherData: 'value',
      nestedData: {
        key: 'value',
      },
      billingPortalMetadata: {
        other_org: {
          customerExternalId: 'other_id',
          otherField: 'value',
        },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: complexMetadata,
      organizationId,
      customerExternalId: 'new_id',
    })

    expect(result).toEqual({
      ...complexMetadata,
      billingPortalMetadata: {
        ...complexMetadata.billingPortalMetadata,
        [organizationId]: { customerExternalId: 'new_id' },
      },
    })
  })

  it('should erase apiKey when setting customerExternalId', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'existing_key',
          customerExternalId: 'existing_id',
        },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      customerExternalId: 'new_id',
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          customerExternalId: 'new_id',
        },
      },
    })
  })

  it('should preserve both customerExternalId and apiKey when setting the same customerExternalId', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'existing_key',
          customerExternalId: 'existing_id',
        },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      customerExternalId: 'existing_id', // Same as before
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'existing_key',
          customerExternalId: 'existing_id',
        },
      },
    })
  })

  it('should overwrite customerExternalId and clear apiKey when setting a different customerExternalId', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'existing_key',
          customerExternalId: 'existing_id',
        },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      customerExternalId: 'new_id', // Different from before
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          customerExternalId: 'new_id',
        },
      },
    })
  })

  it('should erase apiKey when both old and new customerExternalId are undefined', () => {
    const metadata = {
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          apiKey: 'existing_key',
          customerExternalId: undefined,
        },
      },
    }

    const result = setCustomerExternalIdOnServerMetadata({
      existingServerMetadata: metadata,
      organizationId,
      customerExternalId: undefined, // Same as before (undefined)
    })

    expect(result).toEqual({
      ...existingServerMetadata,
      billingPortalMetadata: {
        ...existingServerMetadata.billingPortalMetadata,
        [organizationId]: {
          customerExternalId: undefined,
        },
      },
    })
  })
})
