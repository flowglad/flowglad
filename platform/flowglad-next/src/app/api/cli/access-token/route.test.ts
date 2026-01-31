import { beforeEach, describe, expect, it } from 'bun:test'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import type { AccessTokenRequest, AccessTokenResponse } from './route'
import { POST } from './route'

describe('POST /api/cli/access-token', () => {
  let organization: Organization.Record
  let testmodePricingModel: PricingModel.Record
  let user: User.Record
  let betterAuthUserId: string

  beforeEach(async () => {
    // Setup organization and pricing models
    const orgSetup = await setupOrg()
    organization = orgSetup.organization
    testmodePricingModel = orgSetup.testmodePricingModel

    // Setup user with Better Auth and membership
    const userSetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: false,
      pricingModelId: testmodePricingModel.id,
    })

    betterAuthUserId = userSetup.betterAuthId!
    user = userSetup.user
  })

  it('creates Unkey key with correct metadata for valid request', async () => {
    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const requestBody: AccessTokenRequest = {
      organizationId: organization.id,
      pricingModelId: testmodePricingModel.id,
      livemode: false,
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_session_token',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const response = await POST(request)
    const data: AccessTokenResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.accessToken).toContain('cli_test_')
    expect(typeof data.expiresAt).toBe('string')

    // Verify expiration is roughly 10 minutes from now
    const expiresAt = new Date(data.expiresAt)
    const now = new Date()
    const diffMs = expiresAt.getTime() - now.getTime()
    // Allow 1 minute tolerance
    expect(diffMs).toBeGreaterThan(9 * 60 * 1000)
    expect(diffMs).toBeLessThan(11 * 60 * 1000)
  })

  it('validates user has access to organization', async () => {
    // Create another org that the user doesn't have access to
    const otherOrgSetup = await setupOrg()

    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const requestBody: AccessTokenRequest = {
      organizationId: otherOrgSetup.organization.id,
      pricingModelId: otherOrgSetup.testmodePricingModel.id,
      livemode: false,
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_session_token',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe(
      'User does not have access to this organization'
    )
  })

  it('validates pricing model belongs to organization', async () => {
    // Create another org with a different pricing model
    const otherOrgSetup = await setupOrg()

    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    // Try to use the other org's pricing model with our org
    const requestBody: AccessTokenRequest = {
      organizationId: organization.id,
      pricingModelId: otherOrgSetup.testmodePricingModel.id,
      livemode: false,
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_session_token',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe(
      'Pricing model does not belong to this organization'
    )
  })

  it('returns 401 for invalid session', async () => {
    // Don't mock the auth session - should return null
    globalThis.__mockedAuthSession = null

    const requestBody: AccessTokenRequest = {
      organizationId: organization.id,
      pricingModelId: testmodePricingModel.id,
      livemode: false,
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid_token',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid request body', async () => {
    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_session_token',
        },
        body: JSON.stringify({ invalidField: 'test' }),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Bad Request')
  })

  it('returns 400 for livemode mismatch', async () => {
    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    // Request with livemode=true but using testmode pricing model
    const requestBody: AccessTokenRequest = {
      organizationId: organization.id,
      pricingModelId: testmodePricingModel.id,
      livemode: true, // Mismatch - testmodePricingModel.livemode is false
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_session_token',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('livemode mismatch')
  })

  it('returns 404 for non-existent pricing model', async () => {
    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const requestBody: AccessTokenRequest = {
      organizationId: organization.id,
      pricingModelId: 'pricing_model_nonexistent123',
      livemode: false,
    }

    const request = new Request(
      'http://localhost/api/cli/access-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_session_token',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Pricing model not found')
  })
})
