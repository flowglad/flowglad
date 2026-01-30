import { beforeEach, describe, expect, it } from 'bun:test'
import { MembershipRole } from '@db-core/enums'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  insertMembership,
  selectFocusedMembershipAndOrganization,
  selectMembershipAndOrganizations,
  selectMembershipAndOrganizationsByBetterAuthUserId,
  selectMembershipByIdIncludingDeactivated,
  selectMemberships,
  selectMembershipsAndOrganizationsByMembershipWhere,
  selectMembershipsAndUsersByMembershipWhere,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import core from '@/utils/core'

/**
 * Integration tests for deactivated membership filtering.
 *
 * These tests verify that membership query methods correctly filter out
 * deactivated memberships by default, and include them when explicitly
 * requested via the includeDeactivated option.
 */
describe('membership deactivation filtering', () => {
  let org: Organization.Record
  let pricingModelId: string
  let activeMembership: Membership.Record
  let deactivatedMembership: Membership.Record

  beforeEach(async () => {
    // Setup organization
    const orgData = await setupOrg()
    org = orgData.organization
    pricingModelId = orgData.pricingModel.id

    // Create two memberships - one active, one to be deactivated
    activeMembership = await setupMemberships({
      organizationId: org.id,
      focusedPricingModelId: orgData.pricingModel.id,
    })

    const membershipToDeactivate = await setupMemberships({
      organizationId: org.id,
      focusedPricingModelId: orgData.pricingModel.id,
    })

    // Deactivate one membership
    deactivatedMembership = await adminTransaction(
      async ({ transaction }) => {
        return updateMembership(
          {
            id: membershipToDeactivate.id,
            deactivatedAt: new Date(),
          },
          transaction
        )
      }
    )
  })

  describe('selectMemberships', () => {
    it('excludes deactivated memberships by default and includes them when includeDeactivated is true', async () => {
      // Test default behavior - should exclude deactivated
      const defaultResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMemberships(
            { organizationId: org.id },
            transaction
          )
        }
      )

      // Should only return the active membership
      expect(defaultResults).toHaveLength(1)
      expect(defaultResults[0].id).toBe(activeMembership.id)
      expect(defaultResults[0].deactivatedAt).toBeNull()

      // Test with includeDeactivated: true - should include both
      const allResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMemberships(
            { organizationId: org.id },
            transaction,
            {
              includeDeactivated: true,
            }
          )
        }
      )

      // Should return both memberships
      expect(allResults).toHaveLength(2)
      const ids = allResults.map((m) => m.id).sort()
      expect(ids).toEqual(
        [activeMembership.id, deactivatedMembership.id].sort()
      )

      // Verify one is deactivated and one is not
      const activeResult = allResults.find(
        (m) => m.id === activeMembership.id
      )
      const deactivatedResult = allResults.find(
        (m) => m.id === deactivatedMembership.id
      )
      expect(activeResult?.deactivatedAt).toBeNull()
      expect(typeof deactivatedResult?.deactivatedAt).toBe('number')
    })
  })

  describe('selectMembershipAndOrganizations', () => {
    it('excludes deactivated memberships by default and includes them when includeDeactivated is true', async () => {
      // Test default behavior - should exclude deactivated
      const defaultResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipAndOrganizations(
            { organizationId: org.id },
            transaction
          )
        }
      )

      // Should only return the active membership with organization
      expect(defaultResults).toHaveLength(1)
      expect(defaultResults[0].membership.id).toBe(
        activeMembership.id
      )
      expect(defaultResults[0].organization.id).toBe(org.id)

      // Test with includeDeactivated: true
      const allResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipAndOrganizations(
            { organizationId: org.id },
            transaction,
            { includeDeactivated: true }
          )
        }
      )

      // Should return both memberships with organizations
      expect(allResults).toHaveLength(2)
      const membershipIds = allResults
        .map((r) => r.membership.id)
        .sort()
      expect(membershipIds).toEqual(
        [activeMembership.id, deactivatedMembership.id].sort()
      )
      // All should have the same organization
      allResults.forEach((r) => {
        expect(r.organization.id).toBe(org.id)
      })
    })
  })

  describe('selectMembershipsAndUsersByMembershipWhere', () => {
    it('excludes deactivated memberships by default and includes them when includeDeactivated is true', async () => {
      // Test default behavior - should exclude deactivated
      const defaultResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipsAndUsersByMembershipWhere(
            { organizationId: org.id },
            transaction
          )
        }
      )

      // Should only return the active membership with user
      expect(defaultResults).toHaveLength(1)
      expect(defaultResults[0].membership.id).toBe(
        activeMembership.id
      )
      expect(defaultResults[0].user.id).toBe(activeMembership.userId)

      // Test with includeDeactivated: true
      const allResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipsAndUsersByMembershipWhere(
            { organizationId: org.id },
            transaction,
            { includeDeactivated: true }
          )
        }
      )

      // Should return both memberships with users
      expect(allResults).toHaveLength(2)
      const membershipIds = allResults
        .map((r) => r.membership.id)
        .sort()
      expect(membershipIds).toEqual(
        [activeMembership.id, deactivatedMembership.id].sort()
      )
    })
  })

  describe('selectMembershipsAndOrganizationsByMembershipWhere', () => {
    it('excludes deactivated memberships by default and includes them when includeDeactivated is true', async () => {
      // Test default behavior - should exclude deactivated
      const defaultResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipsAndOrganizationsByMembershipWhere(
            { organizationId: org.id },
            transaction
          )
        }
      )

      // Should only return the active membership with organization
      expect(defaultResults).toHaveLength(1)
      expect(defaultResults[0].membership.id).toBe(
        activeMembership.id
      )
      expect(defaultResults[0].organization.id).toBe(org.id)

      // Test with includeDeactivated: true
      const allResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipsAndOrganizationsByMembershipWhere(
            { organizationId: org.id },
            transaction,
            { includeDeactivated: true }
          )
        }
      )

      // Should return both memberships with organizations
      expect(allResults).toHaveLength(2)
      const membershipIds = allResults
        .map((r) => r.membership.id)
        .sort()
      expect(membershipIds).toEqual(
        [activeMembership.id, deactivatedMembership.id].sort()
      )
    })
  })

  describe('selectMembershipByIdIncludingDeactivated', () => {
    it('returns active memberships when queried by ID', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipByIdIncludingDeactivated(
            activeMembership.id,
            transaction
          )
        }
      )

      expect(result?.id).toBe(activeMembership.id)
      expect(result?.deactivatedAt).toBeNull()
    })

    it('returns deactivated memberships when queried by ID', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipByIdIncludingDeactivated(
            deactivatedMembership.id,
            transaction
          )
        }
      )

      expect(result?.id).toBe(deactivatedMembership.id)
      expect(typeof result?.deactivatedAt).toBe('number')
    })

    it('returns null for non-existent membership IDs', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipByIdIncludingDeactivated(
            'memb_nonexistent123',
            transaction
          )
        }
      )

      expect(result).toBeNull()
    })
  })

  describe('selectMembershipAndOrganizationsByBetterAuthUserId', () => {
    it('excludes deactivated memberships by default and includes them when includeDeactivated is true', async () => {
      // Create a second org for the deactivated membership
      const org2Data = await setupOrg()

      // Create a user with betterAuthId and memberships
      const betterAuthUserId = `ba_${core.nanoid()}`
      const { activeUserMembership, deactivatedUserMembership } =
        await adminTransaction(async ({ transaction }) => {
          const user = await insertUser(
            {
              id: `user_${core.nanoid()}`,
              email: `test+${core.nanoid()}@test.com`,
              name: 'Test User',
              betterAuthId: betterAuthUserId,
            },
            transaction
          )

          const activeMembership = await insertMembership(
            {
              organizationId: org.id,
              userId: user.id,
              focused: true,
              livemode: true,
              role: MembershipRole.Member,
              focusedPricingModelId: pricingModelId,
            },
            transaction
          )

          const deactivatedMembership = await insertMembership(
            {
              organizationId: org2Data.organization.id,
              userId: user.id,
              focused: false,
              livemode: true,
              role: MembershipRole.Member,
              deactivatedAt: new Date(),
              focusedPricingModelId: org2Data.pricingModel.id,
            },
            transaction
          )

          return {
            activeUserMembership: activeMembership,
            deactivatedUserMembership: deactivatedMembership,
          }
        })

      // Test default behavior - should exclude deactivated
      const defaultResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipAndOrganizationsByBetterAuthUserId(
            betterAuthUserId,
            transaction
          )
        }
      )

      // Should only return the active membership
      expect(defaultResults).toHaveLength(1)
      expect(defaultResults[0].membership.id).toBe(
        activeUserMembership.id
      )

      // Test with includeDeactivated: true
      const allResults = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipAndOrganizationsByBetterAuthUserId(
            betterAuthUserId,
            transaction,
            { includeDeactivated: true }
          )
        }
      )

      // Should return both memberships
      expect(allResults).toHaveLength(2)
      const membershipIds = allResults
        .map((r) => r.membership.id)
        .sort()
      expect(membershipIds).toEqual(
        [activeUserMembership.id, deactivatedUserMembership.id].sort()
      )
    })
  })

  describe('selectFocusedMembershipAndOrganization', () => {
    it('returns undefined when the focused membership is deactivated', async () => {
      // Create a user whose only focused membership will be deactivated
      const { user, focusedMembership } = await adminTransaction(
        async ({ transaction }) => {
          const newUser = await insertUser(
            {
              id: `user_${core.nanoid()}`,
              email: `test+${core.nanoid()}@test.com`,
              name: 'Test User',
            },
            transaction
          )

          const membership = await insertMembership(
            {
              organizationId: org.id,
              userId: newUser.id,
              focused: true,
              livemode: true,
              role: MembershipRole.Member,
              focusedPricingModelId: pricingModelId,
            },
            transaction
          )

          return { user: newUser, focusedMembership: membership }
        }
      )

      // Verify we can get the focused membership before deactivation
      const beforeDeactivation = await adminTransaction(
        async ({ transaction }) => {
          return selectFocusedMembershipAndOrganization(
            user.id,
            transaction
          )
        }
      )
      expect(beforeDeactivation?.membership.id).toBe(
        focusedMembership.id
      )

      // Deactivate the membership
      await adminTransaction(async ({ transaction }) => {
        return updateMembership(
          {
            id: focusedMembership.id,
            deactivatedAt: new Date(),
          },
          transaction
        )
      })

      // After deactivation, should return undefined
      const afterDeactivation = await adminTransaction(
        async ({ transaction }) => {
          return selectFocusedMembershipAndOrganization(
            user.id,
            transaction
          )
        }
      )
      expect(afterDeactivation).toBeUndefined()
    })
  })
})
