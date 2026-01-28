import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import { setupOrg, teardownOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import {
  insertMembership,
  selectMembershipByIdIncludingDeactivated,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '@/errors'
import { MembershipRole } from '@/types'
import core from '@/utils/core'
import { innerRemoveMemberFromOrganization } from './removeMemberFromOrganization'

/**
 * Helper to create a user with a membership in the given org.
 */
const createUserWithMembership = async (params: {
  organizationId: string
  role: MembershipRole
  focused?: boolean
}): Promise<{ user: User.Record; membership: Membership.Record }> => {
  return adminTransaction(async ({ transaction }) => {
    const user = await insertUser(
      {
        id: `user_${core.nanoid()}`,
        email: `test+${core.nanoid()}@test.com`,
        name: `Test User ${core.nanoid()}`,
      },
      transaction
    )

    const membership = await insertMembership(
      {
        organizationId: params.organizationId,
        userId: user.id,
        focused: params.focused ?? true,
        livemode: true,
        role: params.role,
      },
      transaction
    )

    return { user, membership }
  })
}

describe('innerRemoveMemberFromOrganization', () => {
  let organization: Organization.Record
  let ownerMembership: Membership.Record

  beforeEach(async () => {
    const { organization: org } = (await setupOrg()).unwrap()
    organization = org

    // Create an owner for this org
    const { membership } = await createUserWithMembership({
      organizationId: organization.id,
      role: MembershipRole.Owner,
    })
    ownerMembership = membership
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  describe('when requester is owner', () => {
    it('successfully removes a member and sets focused=false and deactivatedAt', async () => {
      // Create a member to be removed
      const { membership: memberMembership } =
        await createUserWithMembership({
          organizationId: organization.id,
          role: MembershipRole.Member,
          focused: true,
        })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: memberMembership.id },
            ownerMembership,
            transaction
          )
        }
      )

      expect(Result.isOk(result)).toBe(true)
      const updatedMembership = (
        result as { value: Membership.Record }
      ).value
      expect(updatedMembership.id).toBe(memberMembership.id)
      expect(updatedMembership.focused).toBe(false)
      expect(typeof updatedMembership.deactivatedAt).toBe('number')

      // Verify the membership is not returned by default queries
      const memberships = await adminTransaction(
        async ({ transaction }) => {
          return selectMemberships(
            { organizationId: organization.id },
            transaction
          )
        }
      )
      const membershipIds = memberships.map((m) => m.id)
      expect(membershipIds).not.toContain(memberMembership.id)
      expect(membershipIds).toContain(ownerMembership.id)
    })

    it('returns AuthorizationError when owner tries to remove themselves', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: ownerMembership.id },
            ownerMembership,
            transaction
          )
        }
      )

      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: AuthorizationError }).error
      expect(error).toBeInstanceOf(AuthorizationError)
    })

    it('returns AuthorizationError when trying to remove another owner', async () => {
      // Create another owner
      const { membership: anotherOwnerMembership } =
        await createUserWithMembership({
          organizationId: organization.id,
          role: MembershipRole.Owner,
        })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: anotherOwnerMembership.id },
            ownerMembership,
            transaction
          )
        }
      )

      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: AuthorizationError }).error
      expect(error).toBeInstanceOf(AuthorizationError)
    })
  })

  describe('when requester is member', () => {
    let memberMembership: Membership.Record

    beforeEach(async () => {
      const { membership } = await createUserWithMembership({
        organizationId: organization.id,
        role: MembershipRole.Member,
      })
      memberMembership = membership
    })

    it('successfully removes self (leave org) and sets focused=false and deactivatedAt', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: memberMembership.id },
            memberMembership,
            transaction
          )
        }
      )

      expect(Result.isOk(result)).toBe(true)
      const updatedMembership = (
        result as { value: Membership.Record }
      ).value
      expect(updatedMembership.id).toBe(memberMembership.id)
      expect(updatedMembership.focused).toBe(false)
      expect(typeof updatedMembership.deactivatedAt).toBe('number')
    })

    it('returns NotFoundError when trying to remove another member', async () => {
      // Create another member
      const { membership: anotherMemberMembership } =
        await createUserWithMembership({
          organizationId: organization.id,
          role: MembershipRole.Member,
        })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: anotherMemberMembership.id },
            memberMembership,
            transaction
          )
        }
      )

      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: NotFoundError }).error
      expect(error).toBeInstanceOf(NotFoundError)
    })

    it('returns AuthorizationError when trying to remove the owner', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: ownerMembership.id },
            memberMembership,
            transaction
          )
        }
      )

      // Owner role check happens before requester permission check,
      // so attempting to remove an owner always returns AuthorizationError
      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: AuthorizationError }).error
      expect(error).toBeInstanceOf(AuthorizationError)
    })
  })

  describe('error cases', () => {
    it('returns NotFoundError for non-existent membership', async () => {
      const fakeMembershipId = `memb_${core.nanoid()}`

      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: fakeMembershipId },
            ownerMembership,
            transaction
          )
        }
      )

      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: NotFoundError }).error
      expect(error).toBeInstanceOf(NotFoundError)
      expect(error.id).toBe(fakeMembershipId)
    })

    it('returns ConflictError for already-removed member', async () => {
      // Create and deactivate a member
      const { membership: deactivatedMembership } =
        await createUserWithMembership({
          organizationId: organization.id,
          role: MembershipRole.Member,
        })

      await adminTransaction(async ({ transaction }) => {
        return updateMembership(
          {
            id: deactivatedMembership.id,
            deactivatedAt: Date.now(),
            focused: false,
          },
          transaction
        )
      })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: deactivatedMembership.id },
            ownerMembership,
            transaction
          )
        }
      )

      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: ConflictError }).error
      expect(error).toBeInstanceOf(ConflictError)
      expect(error.conflict).toBe(
        `already deactivated: ${deactivatedMembership.id}`
      )
    })

    it('returns NotFoundError when target membership is in different org (avoids info leakage)', async () => {
      // Create another org with a member
      const { organization: otherOrg } = (await setupOrg()).unwrap()
      const { membership: otherOrgMembership } =
        await createUserWithMembership({
          organizationId: otherOrg.id,
          role: MembershipRole.Member,
        })

      const result = await adminTransaction(
        async ({ transaction }) => {
          return innerRemoveMemberFromOrganization(
            { membershipId: otherOrgMembership.id },
            ownerMembership,
            transaction
          )
        }
      )

      expect(Result.isError(result)).toBe(true)
      const error = (result as { error: NotFoundError }).error
      expect(error).toBeInstanceOf(NotFoundError)
      // Should not reveal anything about whether the membership exists

      // Cleanup
      await teardownOrg({ organizationId: otherOrg.id })
    })
  })

  describe('deactivation behavior', () => {
    it('deactivated member is excluded from auth scope queries', async () => {
      // Create a member
      const { membership: memberMembership } =
        await createUserWithMembership({
          organizationId: organization.id,
          role: MembershipRole.Member,
          focused: true,
        })

      // Remove the member
      await adminTransaction(async ({ transaction }) => {
        return innerRemoveMemberFromOrganization(
          { membershipId: memberMembership.id },
          ownerMembership,
          transaction
        )
      })

      // The deactivated membership should still be retrievable via includeDeactivated
      const membershipIncludingDeactivated = await adminTransaction(
        async ({ transaction }) => {
          return selectMembershipByIdIncludingDeactivated(
            memberMembership.id,
            transaction
          )
        }
      )

      expect(membershipIncludingDeactivated?.id).toBe(
        memberMembership.id
      )
      expect(
        typeof membershipIncludingDeactivated!.deactivatedAt
      ).toBe('number')
      expect(membershipIncludingDeactivated!.focused).toBe(false)

      // But excluded from default queries
      const defaultQueryMemberships = await adminTransaction(
        async ({ transaction }) => {
          return selectMemberships(
            { id: memberMembership.id },
            transaction
          )
        }
      )
      expect(defaultQueryMemberships).toHaveLength(0)
    })
  })
})
