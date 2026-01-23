import { describe, expect, it } from 'bun:test'
import { HttpResponse, http } from 'msw'
import { server } from '@/../mocks/server'
import { dummyOrganization } from '@/stubs/organizationStubs'
import {
  checkSvixApplicationExists,
  createSvixEndpoint,
  findOrCreateSvixApplication,
  getSvixApplicationId,
  getSvixSigningSecret,
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
  // Note: MSW server lifecycle (listen/resetHandlers/close) is managed globally in bun.setup.ts
  // We only need to use server.use() for test-specific handler overrides

  it('returns true when Svix application exists (200 response)', async () => {
    // The default svixHandlers in mocks/svixServer.ts return 200 for GET /app/:appId
    // So calling checkSvixApplicationExists with any ID should return true
    const exists = await checkSvixApplicationExists(
      'app_existing_123'
    )

    expect(exists).toBe(true)
  })

  it('returns false when Svix application does not exist (404 response)', async () => {
    // Override the default handler to return 404 for this specific app ID
    // Svix client expects JSON body even for error responses
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/app_nonexistent_/,
        () => {
          return HttpResponse.json(
            { code: 'not_found', detail: 'Application not found' },
            { status: 404 }
          )
        }
      )
    )

    const exists = await checkSvixApplicationExists(
      'app_nonexistent_456'
    )

    expect(exists).toBe(false)
  })

  it('throws error when Svix API returns non-404 error (500 response)', async () => {
    // Override the handler to return 500 server error
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/app_error_/,
        () => {
          return new HttpResponse(
            JSON.stringify({ message: 'Internal Server Error' }),
            { status: 500 }
          )
        }
      )
    )

    await expect(
      checkSvixApplicationExists('app_error_789')
    ).rejects.toThrow()
  })

  it('throws error when Svix API returns 401 unauthorized', async () => {
    // Override the handler to return 401 unauthorized
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/app_unauth_/,
        () => {
          return new HttpResponse(
            JSON.stringify({ message: 'Unauthorized' }),
            { status: 401 }
          )
        }
      )
    )

    await expect(
      checkSvixApplicationExists('app_unauth_test')
    ).rejects.toThrow()
  })
})

describe('findOrCreateSvixApplication with pricingModelId', () => {
  // Note: MSW server lifecycle is managed globally in bun.setup.ts
  const organization = {
    ...dummyOrganization,
    id: 'org_findorcreate_test',
    securitySalt: 'test-salt-findorcreate',
  }

  it('creates PM-scoped app when pricingModelId is provided', async () => {
    const pricingModelId = 'pm_test_findorcreate'

    // Track the app ID that was used in the request
    let requestedAppId: string | undefined
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/([^/]+)\/?$/,
        ({ params }) => {
          requestedAppId = params[1] as string
          return HttpResponse.json(
            { code: 'not_found', detail: 'Application not found' },
            { status: 404 }
          )
        }
      ),
      http.post(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/?$/,
        async ({ request }) => {
          const body = (await request.json()) as { uid: string }
          return HttpResponse.json({
            id: `app_mock_created`,
            name: 'Mock Application',
            uid: body.uid,
            createdAt: new Date().toISOString(),
          })
        }
      )
    )

    const app = await findOrCreateSvixApplication({
      organization,
      livemode: true,
      pricingModelId,
    })

    // Verify the app was created with PM-scoped ID
    expect(app.uid).toContain(organization.id)
    expect(app.uid).toContain(pricingModelId)
    // Verify the app ID format includes both org and PM
    const expectedIdPrefix = `app_${organization.id}_${pricingModelId}_live_`
    expect(requestedAppId).toStartWith(expectedIdPrefix)
  })

  it('creates legacy app when pricingModelId is not provided', async () => {
    // Track the app ID that was used in the request
    let requestedAppId: string | undefined
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/([^/]+)\/?$/,
        ({ params }) => {
          requestedAppId = params[1] as string
          return HttpResponse.json(
            { code: 'not_found', detail: 'Application not found' },
            { status: 404 }
          )
        }
      ),
      http.post(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/?$/,
        async ({ request }) => {
          const body = (await request.json()) as { uid: string }
          return HttpResponse.json({
            id: `app_mock_created`,
            name: 'Mock Application',
            uid: body.uid,
            createdAt: new Date().toISOString(),
          })
        }
      )
    )

    await findOrCreateSvixApplication({
      organization,
      livemode: true,
      // No pricingModelId - legacy format
    })

    // Verify the legacy app ID format (org ID only, no PM)
    const expectedIdPrefix = `app_${organization.id}_live_`
    expect(requestedAppId).toStartWith(expectedIdPrefix)
    // Verify it does NOT contain a PM ID pattern (which would have another underscore segment)
    const parts = requestedAppId?.split('_') ?? []
    // Legacy format: app_org_<orgid>_live_<hmac> has 4 main parts
    // PM format: app_org_<orgid>_pm_<pmid>_live_<hmac> has more
    expect(parts.length).toBeLessThan(7)
  })
})

describe('createSvixEndpoint with PM-scoped app', () => {
  // Note: MSW server lifecycle is managed globally in bun.setup.ts
  const organization = {
    ...dummyOrganization,
    id: 'org_endpoint_test',
    securitySalt: 'test-salt-endpoint',
  }

  it('creates endpoint in PM-scoped Svix app when webhook has pricingModelId', async () => {
    const pricingModelId = 'pm_endpoint_test'

    // Create a webhook with pricingModelId (type assertion for forward compat)
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
      pricingModelId, // This will be on Webhook.Record after patch 3
    }

    // Track which app ID was used for endpoint creation
    let endpointCreatedInAppId: string | undefined
    server.use(
      http.post(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/([^/]+)\/endpoint\/?$/,
        ({ params }) => {
          endpointCreatedInAppId = params[1] as string
          return HttpResponse.json({
            id: `ep_mock_created`,
            url: webhook.url,
            uid: 'endpoint_uid_test',
            createdAt: new Date().toISOString(),
          })
        }
      )
    )

    // Type assertion: webhook missing some Record fields and pricingModelId not yet on type
    await createSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof createSvixEndpoint
      >[0]['webhook'],
    })

    // Verify endpoint was created in PM-scoped app
    const expectedAppIdPrefix = `app_${organization.id}_${pricingModelId}_live_`
    expect(endpointCreatedInAppId).toStartWith(expectedAppIdPrefix)
  })

  it('creates endpoint in legacy Svix app when webhook has no pricingModelId', async () => {
    // Create a webhook without pricingModelId (legacy)
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
      // No pricingModelId
    }

    // Track which app ID was used for endpoint creation
    let endpointCreatedInAppId: string | undefined
    server.use(
      http.post(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/([^/]+)\/endpoint\/?$/,
        ({ params }) => {
          endpointCreatedInAppId = params[1] as string
          return HttpResponse.json({
            id: `ep_mock_legacy`,
            url: webhook.url,
            uid: 'endpoint_uid_legacy',
            createdAt: new Date().toISOString(),
          })
        }
      )
    )

    await createSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof createSvixEndpoint
      >[0]['webhook'],
    })

    // Verify endpoint was created in legacy app (no PM in ID)
    const expectedLegacyPrefix = `app_${organization.id}_live_`
    expect(endpointCreatedInAppId).toStartWith(expectedLegacyPrefix)
    // Verify it doesn't contain a PM ID
    expect(endpointCreatedInAppId).not.toContain('pm_')
  })
})

describe('getSvixSigningSecret with PM-scoped app', () => {
  // Note: MSW server lifecycle is managed globally in bun.setup.ts
  const organization = {
    ...dummyOrganization,
    id: 'org_secret_test',
    securitySalt: 'test-salt-secret',
  }

  it('gets signing secret from PM-scoped Svix app when webhook has pricingModelId', async () => {
    const pricingModelId = 'pm_secret_test'

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
      pricingModelId,
    }

    // Track which app ID was used for getting the secret
    let secretRequestedFromAppId: string | undefined
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/([^/]+)\/endpoint\/[^/]+\/secret\/?$/,
        ({ params }) => {
          secretRequestedFromAppId = params[1] as string
          return HttpResponse.json({
            key: 'whsec_pm_scoped_secret',
          })
        }
      )
    )

    const result = await getSvixSigningSecret({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof getSvixSigningSecret
      >[0]['webhook'],
    })

    // Verify secret was requested from PM-scoped app
    const expectedAppIdPrefix = `app_${organization.id}_${pricingModelId}_live_`
    expect(secretRequestedFromAppId).toStartWith(expectedAppIdPrefix)
    expect(result.key).toBe('whsec_pm_scoped_secret')
  })
})

describe('updateSvixEndpoint with PM-scoped app', () => {
  // Note: MSW server lifecycle is managed globally in bun.setup.ts
  const organization = {
    ...dummyOrganization,
    id: 'org_update_test',
    securitySalt: 'test-salt-update',
  }

  it('updates endpoint in PM-scoped Svix app when webhook has pricingModelId', async () => {
    const pricingModelId = 'pm_update_test'

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
      pricingModelId,
    }

    // Track which app ID was used when finding/creating the application
    // This verifies the PM-scoped app ID is used
    let findOrCreateAppRequestedId: string | undefined
    server.use(
      http.get(
        /https:\/\/api(\.\w+)?\.svix\.com\/api\/v1\/app\/([^/]+)\/?$/,
        ({ params }) => {
          findOrCreateAppRequestedId = params[1] as string
          return HttpResponse.json({
            id: findOrCreateAppRequestedId,
            name: 'Mock Application',
            uid: findOrCreateAppRequestedId,
            createdAt: new Date().toISOString(),
          })
        }
      )
    )

    await updateSvixEndpoint({
      organization,
      webhook: webhook as unknown as Parameters<
        typeof updateSvixEndpoint
      >[0]['webhook'],
    })

    // Verify findOrCreateSvixApplication was called with PM-scoped app ID
    const expectedAppIdPrefix = `app_${organization.id}_${pricingModelId}_live_`
    expect(findOrCreateAppRequestedId).toStartWith(
      expectedAppIdPrefix
    )
  })
})
