import { beforeEach, describe, expect, it } from 'bun:test'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { PricingModel } from '@db-core/schema/pricingModels'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectFocusedMembershipAndOrganizationAndPricingModel,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'

describe('selectFocusedMembershipAndOrganizationAndPricingModel', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let testmodePricingModel: PricingModel.Record
  let membership: Membership.Record
  let userId: string

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    testmodePricingModel = orgData.testmodePricingModel

    membership = await setupMemberships({
      organizationId: organization.id,
      focusedPricingModelId: pricingModel.id,
    })
    userId = membership.userId
  })

  it('returns the membership, organization, and pricing model when user has a focused membership with focusedPricingModelId', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectFocusedMembershipAndOrganizationAndPricingModel(
        userId,
        transaction
      )
    })

    if (!result) {
      throw new Error('Expected result to be defined')
    }
    expect(result.membership.id).toBe(membership.id)
    expect(result.membership.userId).toBe(userId)
    expect(result.membership.focused).toBe(true)
    expect(result.membership.focusedPricingModelId).toBe(
      pricingModel.id
    )

    expect(result.organization.id).toBe(organization.id)
    expect(result.organization.name).toBe(organization.name)

    expect(result.pricingModel.id).toBe(pricingModel.id)
    expect(result.pricingModel.organizationId).toBe(organization.id)
    expect(result.pricingModel.livemode).toBe(true)
  })

  it('returns updated pricing model data when focused pricing model is changed', async () => {
    // Switch to testmode pricing model
    await adminTransaction(async ({ transaction }) => {
      await updateMembership(
        {
          id: membership.id,
          focusedPricingModelId: testmodePricingModel.id,
        },
        transaction
      )
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFocusedMembershipAndOrganizationAndPricingModel(
        userId,
        transaction
      )
    })

    if (!result) {
      throw new Error('Expected result to be defined')
    }
    expect(result.pricingModel.id).toBe(testmodePricingModel.id)
    expect(result.pricingModel.livemode).toBe(false)
  })

  it('returns undefined when user has no focused membership', async () => {
    // Unfocus the membership
    await adminTransaction(async ({ transaction }) => {
      await updateMembership(
        {
          id: membership.id,
          focused: false,
        },
        transaction
      )
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFocusedMembershipAndOrganizationAndPricingModel(
        userId,
        transaction
      )
    })

    expect(result).toBeUndefined()
  })

  it('returns undefined when user does not exist', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectFocusedMembershipAndOrganizationAndPricingModel(
        'non-existent-user-id',
        transaction
      )
    })

    expect(result).toBeUndefined()
  })

  it('returns undefined when focused membership is deactivated', async () => {
    // Deactivate the membership
    await adminTransaction(async ({ transaction }) => {
      await updateMembership(
        {
          id: membership.id,
          deactivatedAt: Date.now(),
        },
        transaction
      )
    })

    const result = await adminTransaction(async ({ transaction }) => {
      return selectFocusedMembershipAndOrganizationAndPricingModel(
        userId,
        transaction
      )
    })

    expect(result).toBeUndefined()
  })

  it('returns correctly parsed schema objects for membership, organization, and pricingModel', async () => {
    const result = await adminTransaction(async ({ transaction }) => {
      return selectFocusedMembershipAndOrganizationAndPricingModel(
        userId,
        transaction
      )
    })

    if (!result) {
      throw new Error('Expected result to be defined')
    }

    // Verify membership has expected schema fields
    expect(result.membership).toHaveProperty('id')
    expect(result.membership).toHaveProperty('userId')
    expect(result.membership).toHaveProperty('organizationId')
    expect(result.membership).toHaveProperty('focused')
    expect(result.membership).toHaveProperty('focusedPricingModelId')
    expect(result.membership).toHaveProperty('livemode')

    // Verify organization has expected schema fields
    expect(result.organization).toHaveProperty('id')
    expect(result.organization).toHaveProperty('name')

    // Verify pricingModel has expected schema fields
    expect(result.pricingModel).toHaveProperty('id')
    expect(result.pricingModel).toHaveProperty('organizationId')
    expect(result.pricingModel).toHaveProperty('livemode')
    expect(result.pricingModel).toHaveProperty('name')
  })
})
