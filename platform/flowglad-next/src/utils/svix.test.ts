import { describe, expect, it } from 'bun:test'
import { HttpResponse, http } from 'msw'
import { server } from '@/../mocks/server'
import { dummyOrganization } from '@/stubs/organizationStubs'
import {
  checkSvixApplicationExists,
  getSvixApplicationId,
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
