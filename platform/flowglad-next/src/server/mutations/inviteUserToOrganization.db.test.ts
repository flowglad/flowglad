import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test'
import type { Membership } from '@db-core/schema/memberships'
import type { Organization } from '@db-core/schema/organizations'
import type { User } from '@db-core/schema/users'
import { Result } from 'better-result'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import {
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import * as actualEmail from '@/utils/email'
import { sendOrganizationInvitationEmail } from '@/utils/email'
import { innerInviteUserToOrganizationHandler } from './inviteUserToOrganization'

mock.module('@/utils/email', () => ({
  ...actualEmail,
  sendOrganizationInvitationEmail: mock(),
}))

describe('innerInviteUserToOrganizationHandler', () => {
  let organization: Organization.Record
  let inviterUser: User.Record
  let testmodePricingModelId: string
  let focusedMembership: {
    organization: Pick<Organization.Record, 'id' | 'name'>
    membership: Pick<Membership.Record, 'userId'>
  }

  beforeEach(async () => {
    // Clear mock call history between tests
    ;(
      sendOrganizationInvitationEmail as ReturnType<typeof mock>
    ).mockClear()
    const { organization: org, testmodePricingModel } =
      await setupOrg()
    organization = org
    testmodePricingModelId = testmodePricingModel.id

    const { user } = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    inviterUser = user

    focusedMembership = {
      organization: {
        id: organization.id,
        name: organization.name,
      },
      membership: {
        userId: inviterUser.id,
      },
    }
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  describe('New User Invitation', () => {
    it('should create a new user and membership when the user does not exist', async () => {
      const email = `newuser-${Math.random()}@test.com`
      const input = { email, name: 'New User' }

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser,
        testmodePricingModelId
      )

      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith({
        to: [email],
        organizationName: organization.name,
        inviterName: inviterUser.name ?? undefined,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const [newUser] = await selectUsers({ email }, transaction)
          expect(newUser.name).toBe(input.name)

          const newMemberships = await selectMemberships(
            {
              userId: newUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(newMemberships).toHaveLength(1)
          expect(newMemberships[0].focused).toBe(false)
          expect(newMemberships[0].livemode).toBe(false)
          return Result.ok(undefined)
        })
      ).unwrap()

      expect(result).toEqual({ action: 'created' })
    })

    it("should handle invitations for new users when the inviter's name is not available", async () => {
      const inviterUserWithoutName = { ...inviterUser, name: null }
      const email = `newuser-${Math.random()}@test.com`
      const input = { email, name: 'New User' }

      await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUserWithoutName,
        testmodePricingModelId
      )

      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          inviterName: undefined,
        })
      )
    })

    it("creates user with empty string name when invitee's name is not provided", async () => {
      const email = `newuser-${Math.random()}@test.com`
      const input = { email }

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser,
        testmodePricingModelId
      )

      expect(result).toEqual({ action: 'created' })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const [newUser] = await selectUsers({ email }, transaction)
          expect(newUser.name).toBe('')

          const newMemberships = await selectMemberships(
            {
              userId: newUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(newMemberships).toHaveLength(1)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('Existing User Invitation', () => {
    it('should add an existing user to the organization and send invitation email', async () => {
      const { organization: otherOrg } = await setupOrg()
      const { user: existingUser } = await setupUserAndApiKey({
        organizationId: otherOrg.id,
        livemode: true,
      })
      const input = { email: existingUser.email! }

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser,
        testmodePricingModelId
      )

      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith({
        to: [existingUser.email],
        organizationName: organization.name,
        inviterName: inviterUser.name ?? undefined,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const memberships = await selectMemberships(
            {
              userId: existingUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(memberships).toHaveLength(1)
          expect(memberships[0].focused).toBe(false)
          expect(memberships[0].livemode).toBe(false)
          return Result.ok(undefined)
        })
      ).unwrap()

      expect(result).toEqual({ action: 'created' })
      await teardownOrg({ organizationId: otherOrg.id })
    })

    it('should not send email if the existing user is already an active member of the organization', async () => {
      const { user: existingUser } = await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
      const input = { email: existingUser.email! }

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const memberships = await selectMemberships(
            {
              userId: existingUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(memberships.length).toBeGreaterThan(0)
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser,
        testmodePricingModelId
      )

      expect(sendOrganizationInvitationEmail).not.toHaveBeenCalled()

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const memberships = await selectMemberships(
            {
              userId: existingUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(memberships).toHaveLength(1)
          return Result.ok(undefined)
        })
      ).unwrap()

      expect(result).toEqual({ action: 'already_member' })
    })
  })

  describe('Membership Reactivation', () => {
    it('should reactivate a previously removed member and send invitation email', async () => {
      // Setup: create a user with a deactivated membership
      const { user: removedUser, membership } =
        await setupUserAndApiKey({
          organizationId: organization.id,
          livemode: true,
        })

      // Deactivate the membership
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateMembership(
            { id: membership.id, deactivatedAt: Date.now() },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Verify membership is deactivated (not visible in default query)
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const activeMemberships = await selectMemberships(
            {
              userId: removedUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(activeMemberships).toHaveLength(0)
          return Result.ok(undefined)
        })
      ).unwrap()

      const input = { email: removedUser.email! }

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser,
        testmodePricingModelId
      )

      // Should send invitation email for reactivation
      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith({
        to: [removedUser.email],
        organizationName: organization.name,
        inviterName: inviterUser.name ?? undefined,
      })

      // Membership should be reactivated
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const memberships = await selectMemberships(
            {
              userId: removedUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(memberships).toHaveLength(1)
          expect(memberships[0].deactivatedAt).toBeNull()
          return Result.ok(undefined)
        })
      ).unwrap()

      expect(result).toEqual({ action: 'reactivated' })
    })

    it('should reactivate and send email even when inviter has no name', async () => {
      const inviterUserWithoutName = { ...inviterUser, name: null }

      const { user: removedUser, membership } =
        await setupUserAndApiKey({
          organizationId: organization.id,
          livemode: true,
        })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateMembership(
            { id: membership.id, deactivatedAt: Date.now() },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const input = { email: removedUser.email! }

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUserWithoutName,
        testmodePricingModelId
      )

      expect(result).toEqual({ action: 'reactivated' })

      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          inviterName: undefined,
        })
      )

      // Verify reactivation happened
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const memberships = await selectMemberships(
            {
              userId: removedUser.id,
              organizationId: organization.id,
            },
            transaction
          )
          expect(memberships).toHaveLength(1)
          expect(memberships[0].deactivatedAt).toBeNull()
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })
})
