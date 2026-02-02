import { describe, expect, it } from 'bun:test'
import { dummyOrganization } from '@/stubs/organizationStubs'
import {
  checkSvixApplicationExists,
  createSvixEndpoint,
  findOrCreateSvixApplication,
  getSvixApplicationId,
  getSvixSigningSecret,
  sendSvixEvent,
  updateSvixEndpoint,
} from './svix'

describe('getSvixApplicationId', () => {
  const organization = {
    ...dummyOrganization,
    id: 'org_test123',
    securitySalt: 'test-salt-abc',
  }

  it('generates legacy format when pricingModelId is not provided, containing org id and livemode in the ID', () => {
    const liveId = getSvixApplicationId({
      organization,
      livemode: true,
    })
    const testId = getSvixApplicationId({
      organization,
      livemode: false,
    })

    // The format should be: app_${orgId}_${livemode}_${hmac}
    // Verify the ID starts with app_ prefix and contains org id
    expect(liveId).toStartWith('app_org_test123_live_')
    expect(testId).toStartWith('app_org_test123_test_')

    // Verify livemode produces different IDs
    expect(liveId).not.toBe(testId)

    // Verify the IDs are deterministic (same inputs produce same output)
    const liveId2 = getSvixApplicationId({
      organization,
      livemode: true,
    })
    expect(liveId).toBe(liveId2)
  })

  it('generates PM-scoped format when pricingModelId is provided, containing org id, pricing model id, and livemode in the ID', () => {
    const pricingModelId = 'pm_abc123'
    const pmScopedId = getSvixApplicationId({
      organization,
      livemode: true,
      pricingModelId,
    })

    // The format should be: app_${orgId}_${pmId}_${livemode}_${hmac}
    // Verify the ID starts with app_ prefix and contains both org id and pm id
    expect(pmScopedId).toStartWith(
      `app_${organization.id}_${pricingModelId}_live_`
    )

    // Verify it's different from legacy format
    const legacyId = getSvixApplicationId({
      organization,
      livemode: true,
    })
    expect(pmScopedId).not.toBe(legacyId)

    // Verify the ID is deterministic
    const pmScopedId2 = getSvixApplicationId({
      organization,
      livemode: true,
      pricingModelId,
    })
    expect(pmScopedId).toBe(pmScopedId2)
  })

  it('generates different IDs for the same org with different pricing models, and the same ID for the same pricing model', () => {
    const pm1 = 'pm_first'
    const pm2 = 'pm_second'

    const id1 = getSvixApplicationId({
      organization,
      livemode: true,
      pricingModelId: pm1,
    })
    const id2 = getSvixApplicationId({
      organization,
      livemode: true,
      pricingModelId: pm2,
    })
    const id1Again = getSvixApplicationId({
      organization,
      livemode: true,
      pricingModelId: pm1,
    })

    // Different PMs should produce different IDs
    expect(id1).not.toBe(id2)

    // Same PM should produce the same ID (deterministic)
    expect(id1).toBe(id1Again)

    // Both should contain their respective PM IDs
    expect(id1).toContain(pm1)
    expect(id2).toContain(pm2)
  })

  it('throws an error when organization has no securitySalt', () => {
    // Use empty string to trigger the runtime check if (!organization.securitySalt)
    const orgWithoutSalt = {
      ...dummyOrganization,
      id: 'org_nosalt',
      securitySalt: '',
    }

    expect(() => {
      getSvixApplicationId({
        organization: orgWithoutSalt,
        livemode: true,
      })
    }).toThrow(`No security salt found for organization org_nosalt`)
  })
})

describe('checkSvixApplicationExists', () => {
  // Tests use flowglad-mock-server (localhost:9001) with sentinel values

  it('returns true when Svix application exists (200 response)', async () => {
    // Mock server returns 200 for app IDs without _notfound_ sentinel
    const exists = await checkSvixApplicationExists(
      'app_existing_123'
    )

    expect(exists).toBe(true)
  })

  it('returns false when Svix application does not exist (404 response)', async () => {
    // Mock server returns 404 for app IDs containing _notfound_ sentinel
    const exists = await checkSvixApplicationExists(
      'app_notfound_nonexistent_456'
    )

    expect(exists).toBe(false)
  })
})

describe('findOrCreateSvixApplication', () => {
  // Tests verify observable behavior: the returned application object

  const organization = {
    ...dummyOrganization,
    id: 'org_findorcreate_test',
    securitySalt: 'test-salt-findorcreate',
  }

  it('returns application with PM-scoped uid when pricingModelId is provided', async () => {
    const pricingModelId = 'pm_test_findorcreate'

    const app = await findOrCreateSvixApplication({
      organization,
      livemode: true,
      pricingModelId,
    })

    // The uid should contain the expected PM-scoped format
    const expectedIdPrefix = `app_${organization.id}_${pricingModelId}_live_`
    expect(app.uid).toStartWith(expectedIdPrefix)
  })

  it('returns application with legacy uid when pricingModelId is not provided', async () => {
    const app = await findOrCreateSvixApplication({
      organization,
      livemode: true,
      // No pricingModelId - legacy format
    })

    // The uid should have legacy format (no pricingModelId segment)
    const expectedIdPrefix = `app_${organization.id}_live_`
    expect(app.uid).toStartWith(expectedIdPrefix)
  })
})

describe('createSvixEndpoint', () => {
  // Tests verify observable behavior: the function completes successfully

  const organization = {
    ...dummyOrganization,
    id: 'org_endpoint_test',
    securitySalt: 'test-salt-endpoint',
  }

  it('creates endpoint successfully when webhook has pricingModelId', async () => {
    const webhook = {
      id: 'webhook_test_123',
      livemode: true,
      url: 'https://example.com/webhook',
      filterTypes: ['customer.created'],
      name: 'Test Webhook',
      active: true,
      organizationId: organization.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      pricingModelId: 'pm_endpoint_test',
    }

    // Should complete without throwing
    const endpoint = await createSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof createSvixEndpoint
      >[0]['webhook'],
    })

    expect(typeof endpoint.id).toBe('string')
  })

  it('creates endpoint successfully when webhook has no pricingModelId', async () => {
    const webhook = {
      id: 'webhook_legacy_456',
      livemode: true,
      url: 'https://example.com/webhook-legacy',
      filterTypes: ['customer.created'],
      name: 'Legacy Webhook',
      active: true,
      organizationId: organization.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      // No pricingModelId - legacy
    }

    // Should complete without throwing
    const endpoint = await createSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof createSvixEndpoint
      >[0]['webhook'],
    })

    expect(typeof endpoint.id).toBe('string')
  })
})

describe('getSvixSigningSecret', () => {
  // Tests verify observable behavior: returns a signing secret

  const organization = {
    ...dummyOrganization,
    id: 'org_secret_test',
    securitySalt: 'test-salt-secret',
  }

  it('returns signing secret for webhook with pricingModelId', async () => {
    const webhook = {
      id: 'webhook_secret_123',
      livemode: true,
      url: 'https://example.com/webhook',
      filterTypes: ['customer.created'],
      name: 'Test Webhook',
      active: true,
      organizationId: organization.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      pricingModelId: 'pm_secret_test',
    }

    const result = await getSvixSigningSecret({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof getSvixSigningSecret
      >[0]['webhook'],
    })

    // Should return a signing secret
    expect(result.key).toStartWith('whsec_')
  })

  it('returns signing secret for webhook without pricingModelId', async () => {
    const webhook = {
      id: 'webhook_secret_legacy',
      livemode: true,
      url: 'https://example.com/webhook',
      filterTypes: ['customer.created'],
      name: 'Legacy Webhook',
      active: true,
      organizationId: organization.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      // No pricingModelId
    }

    const result = await getSvixSigningSecret({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof getSvixSigningSecret
      >[0]['webhook'],
    })

    // Should return a signing secret
    expect(result.key).toStartWith('whsec_')
  })
})

describe('updateSvixEndpoint', () => {
  // Tests verify observable behavior: the function completes successfully

  const organization = {
    ...dummyOrganization,
    id: 'org_update_test',
    securitySalt: 'test-salt-update',
  }

  it('updates endpoint successfully when webhook has pricingModelId', async () => {
    const webhook = {
      id: 'webhook_update_123',
      livemode: true,
      url: 'https://example.com/webhook-updated',
      filterTypes: ['customer.created', 'customer.updated'],
      name: 'Updated Webhook',
      active: false,
      organizationId: organization.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      pricingModelId: 'pm_update_test',
    }

    // Should complete without throwing
    const endpoint = await updateSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof updateSvixEndpoint
      >[0]['webhook'],
    })

    expect(typeof endpoint.id).toBe('string')
  })

  it('updates endpoint successfully when webhook has no pricingModelId', async () => {
    const webhook = {
      id: 'webhook_update_legacy',
      livemode: true,
      url: 'https://example.com/webhook-legacy',
      filterTypes: ['customer.created'],
      name: 'Legacy Webhook',
      active: true,
      organizationId: organization.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      // No pricingModelId
    }

    // Should complete without throwing
    const endpoint = await updateSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof updateSvixEndpoint
      >[0]['webhook'],
    })

    expect(typeof endpoint.id).toBe('string')
  })
})

describe('sendSvixEvent', () => {
  // These tests verify observable behavior using the mock server (localhost:9001)
  // with sentinel values to control which apps exist/don't exist

  const organization = {
    ...dummyOrganization,
    id: 'org_send_event_test',
    securitySalt: 'test-salt-send-event',
  }

  const createTestEvent = (
    overrides: { pricingModelId?: string; livemode?: boolean } = {}
  ) => ({
    id: 'event_test_123',
    type: 'customer.created',
    payload: {
      id: 'cust_123',
      object: 'customer',
    },
    hash: `hash_unique_${Date.now()}_${Math.random()}`,
    livemode: overrides.livemode ?? true,
    organizationId: organization.id,
    occurredAt: new Date(),
    submittedAt: new Date(),
    processedAt: null,
    metadata: {},
    objectEntity: null,
    objectId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    pricingModelId: overrides.pricingModelId,
  })

  it('completes successfully when app exists', async () => {
    // No _notfound_ sentinel, so mock server returns 200 for app check
    const event = createTestEvent({ pricingModelId: 'pm_test' })

    // Should complete without throwing
    await sendSvixEvent({
      event: event as unknown as Parameters<
        typeof sendSvixEvent
      >[0]['event'],
      organization,
    })
  })

  it('completes successfully (no-op) when no apps exist', async () => {
    // Use _notfound_ sentinel so mock server returns 404 for all app checks
    const orgWithNotFound = {
      ...dummyOrganization,
      id: 'org_notfound_test',
      securitySalt: 'test-salt-notfound',
    }
    const event = createTestEvent({
      pricingModelId: 'pm_notfound_test',
    })
    event.organizationId = orgWithNotFound.id

    // Should complete without throwing (silent no-op when no apps configured)
    await sendSvixEvent({
      event: event as unknown as Parameters<
        typeof sendSvixEvent
      >[0]['event'],
      organization: orgWithNotFound,
    })
  })
})
