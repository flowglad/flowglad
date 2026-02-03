import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Result } from 'better-result'

// Mock next/headers BEFORE importing route
mock.module('next/headers', () => ({
  headers: mock(() => new Headers()),
}))

import { MembershipRole } from '@db-core/enums'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { User } from '@db-core/schema/users'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import type { ListPricingModelsResponse } from './route'
import { GET } from './route'

describe('GET /api/cli/list-pricing-models', () => {
  let organization1: Organization.Record
  let organization2: Organization.Record
  let testmodePricingModel1: PricingModel.Record
  let testmodePricingModel2: PricingModel.Record
  let livemodePricingModel: PricingModel.Record
  let user: User.Record
  let betterAuthUserId: string

  beforeEach(async () => {
    // Setup first organization (has both testmode and livemode PMs)
    const orgSetup1 = await setupOrg()
    organization1 = orgSetup1.organization
    testmodePricingModel1 = orgSetup1.testmodePricingModel
    livemodePricingModel = orgSetup1.pricingModel

    // Setup second organization
    const orgSetup2 = await setupOrg()
    organization2 = orgSetup2.organization
    testmodePricingModel2 = orgSetup2.testmodePricingModel

    // Setup user with membership in first org
    const userSetup = await setupUserAndApiKey({
      organizationId: organization1.id,
      livemode: false,
      pricingModelId: testmodePricingModel1.id,
      forceNewUser: true,
    })

    if (!userSetup.betterAuthId) {
      throw new Error(
        'Expected betterAuthId to be defined for new user'
      )
    }
    betterAuthUserId = userSetup.betterAuthId
    user = userSetup.user

    // Add user membership to second organization
    await adminTransaction(async ({ transaction }) => {
      await insertMembership(
        {
          userId: user.id,
          organizationId: organization2.id,
          focused: false,
          focusedPricingModelId: testmodePricingModel2.id,
          livemode: false,
          role: MembershipRole.Member,
        },
        transaction
      )
      return Result.ok(undefined)
    })
  })

  it('returns only test mode pricing models by default when livemode is not specified', async () => {
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?organizationId=${organization1.id}`
    )
    const response = await GET(request)
    const data: ListPricingModelsResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.pricingModels).toHaveLength(1)
    expect(data.pricingModels[0].id).toBe(testmodePricingModel1.id)
    expect(data.pricingModels[0].name).toBe(
      testmodePricingModel1.name
    )
    expect(data.pricingModels[0].isDefault).toBe(
      testmodePricingModel1.isDefault
    )
    expect(
      new Date(data.pricingModels[0].updatedAt).toISOString()
    ).toBe(data.pricingModels[0].updatedAt)
  })

  it('returns pricing models for specified organization when user has access', async () => {
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?organizationId=${organization2.id}`
    )
    const response = await GET(request)
    const data: ListPricingModelsResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.pricingModels).toHaveLength(1)
    expect(data.pricingModels[0].id).toBe(testmodePricingModel2.id)
  })

  it('returns 403 Forbidden when user does not have access to the organization', async () => {
    // Setup a third org that the user does NOT have membership in
    const orgSetup3 = await setupOrg()
    const organization3 = orgSetup3.organization

    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?organizationId=${organization3.id}`
    )
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('returns single PM with org info when pricingModelId is provided alone', async () => {
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?pricingModelId=${testmodePricingModel1.id}`
    )
    const response = await GET(request)
    const data: ListPricingModelsResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.organization).toMatchObject({
      id: organization1.id,
      name: organization1.name,
    })
    expect(data.pricingModels).toHaveLength(1)
    expect(data.pricingModels[0].id).toBe(testmodePricingModel1.id)
  })

  it('returns 404 Not Found when pricingModelId does not exist', async () => {
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?pricingModelId=pricing_model_nonexistent`
    )
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Pricing model not found')
  })

  it('returns 403 Forbidden when user does not have access to the pricing model org', async () => {
    // Setup a third org that the user does NOT have membership in
    const orgSetup3 = await setupOrg()
    const testmodePricingModel3 = orgSetup3.testmodePricingModel

    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?pricingModelId=${testmodePricingModel3.id}`
    )
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('returns 401 Unauthorized when session is invalid', async () => {
    globalThis.__mockedAuthSession = null

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?organizationId=${organization1.id}`
    )
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(data.message).toBe('Invalid or expired session')
  })

  it('returns 400 Bad Request when neither organizationId nor pricingModelId is provided', async () => {
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models`
    )
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Bad Request')
    expect(data.message).toBe(
      'organizationId or pricingModelId is required'
    )
  })

  it('returns livemode pricing models when livemode=true is specified', async () => {
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const request = new Request(
      `http://localhost/api/cli/list-pricing-models?organizationId=${organization1.id}&livemode=true`
    )
    const response = await GET(request)
    const data: ListPricingModelsResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.pricingModels).toHaveLength(1)
    expect(data.pricingModels[0].id).toBe(livemodePricingModel.id)
  })
})
