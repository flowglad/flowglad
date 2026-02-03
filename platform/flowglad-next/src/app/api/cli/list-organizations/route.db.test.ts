import { beforeEach, describe, expect, it, mock } from 'bun:test'

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
import {
  insertMembership,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import type { ListOrganizationsResponse } from './route'
import { GET } from './route'

describe('GET /api/cli/list-organizations', () => {
  let organization1: Organization.Record
  let organization2: Organization.Record
  let testmodePricingModel1: PricingModel.Record
  let testmodePricingModel2: PricingModel.Record
  let user: User.Record
  let betterAuthUserId: string

  beforeEach(async () => {
    // Setup first organization
    const orgSetup1 = await setupOrg()
    organization1 = orgSetup1.organization
    testmodePricingModel1 = orgSetup1.testmodePricingModel

    // Setup second organization
    const orgSetup2 = await setupOrg()
    organization2 = orgSetup2.organization
    testmodePricingModel2 = orgSetup2.testmodePricingModel

    // Setup user with membership in first org
    const userSetup = await setupUserAndApiKey({
      organizationId: organization1.id,
      livemode: false,
      pricingModelId: testmodePricingModel1.id,
    })

    betterAuthUserId = userSetup.betterAuthId!
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
    })
  })

  it('returns all organizations user is a member of when user has memberships in multiple orgs', async () => {
    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const response = await GET()
    const data: ListOrganizationsResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.organizations).toHaveLength(2)

    const orgIds = data.organizations.map((o) => o.id)
    expect(orgIds).toContain(organization1.id)
    expect(orgIds).toContain(organization2.id)

    // Verify each organization has the expected fields
    for (const org of data.organizations) {
      expect(typeof org.id).toBe('string')
      expect(typeof org.name).toBe('string')
      expect(typeof org.createdAt).toBe('string')
      // Verify createdAt is a valid ISO date
      expect(new Date(org.createdAt).toISOString()).toBe(
        org.createdAt
      )
    }
  })

  it('excludes deactivated memberships from the organizations list', async () => {
    // Deactivate membership in second organization
    await adminTransaction(async ({ transaction }) => {
      const [membership] = await selectMemberships(
        { userId: user.id, organizationId: organization2.id },
        transaction
      )
      await updateMembership(
        { id: membership.id, deactivatedAt: new Date() },
        transaction
      )
    })

    // Mock the auth session
    globalThis.__mockedAuthSession = {
      user: { id: betterAuthUserId, email: user.email },
      session: { id: 'session_123' },
    }

    const response = await GET()
    const data: ListOrganizationsResponse = await response.json()

    expect(response.status).toBe(200)
    expect(data.organizations).toHaveLength(1)
    expect(data.organizations[0].id).toBe(organization1.id)
  })

  it('returns 401 Unauthorized when session is invalid', async () => {
    // Don't mock the auth session - should return null
    globalThis.__mockedAuthSession = null

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(data.message).toBe('Invalid or expired session')
  })
})
