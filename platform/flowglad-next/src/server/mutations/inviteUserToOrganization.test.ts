import {
  describe,
  it,
  vi,
  beforeEach,
  expect,
  afterEach,
} from 'vitest'
import { innerInviteUserToOrganizationHandler } from './inviteUserToOrganization'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '../../../seedDatabase'
import { organizations } from '@/db/schema/organizations'
import { users } from '@/db/schema/users'
import { memberships } from '@/db/schema/memberships'
import { stackServerApp } from '@/stack'
import { sendOrganizationInvitationEmail } from '@/utils/email'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import { adminTransaction } from '@/db/adminTransaction'

vi.mock('@/stack', () => ({
  stackServerApp: {
    createUser: vi.fn(),
  },
}))

vi.mock('@/utils/email', () => ({
  sendOrganizationInvitationEmail: vi.fn(),
}))

type Organization = typeof organizations.$inferSelect
type User = typeof users.$inferSelect
type Membership = typeof memberships.$inferSelect

describe('innerInviteUserToOrganizationHandler', () => {
  let organization: Organization
  let inviterUser: User
  let focusedMembership: {
    organization: Pick<Organization, 'id' | 'name'>
    membership: Pick<Membership, 'livemode' | 'userId'>
  }

  beforeEach(async () => {
    vi.resetAllMocks()
    const { organization: org } = await setupOrg()
    organization = org

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
        livemode: true,
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
      const mockNewStackUser = {
        id: `usr_test_${Math.random()}`,
        primary_email: email,
        display_name: input.name,
      }
      vi.mocked(stackServerApp.createUser).mockResolvedValue({
        toClientJson: () => mockNewStackUser,
      } as any)

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser
      )

      expect(stackServerApp.createUser).toHaveBeenCalledWith({
        primaryEmail: email,
        displayName: input.name,
      })
      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith({
        to: [email],
        organizationName: organization.name,
        inviterName: inviterUser.name ?? undefined,
      })

      await adminTransaction(async ({ transaction }) => {
        const [newUser] = await selectUsers({ email }, transaction)
        expect(newUser).toBeDefined()
        expect(newUser.id).toBe(mockNewStackUser.id)
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
        expect(newMemberships[0].livemode).toBe(true)
      })

      expect(result).toEqual({
        success: true,
        message: 'User created and invited to organization',
      })
    })

    it("should handle invitations for new users when the inviter's name is not available", async () => {
      const inviterUserWithoutName = { ...inviterUser, name: null }
      const email = `newuser-${Math.random()}@test.com`
      const input = { email, name: 'New User' }
      const mockNewStackUser = {
        id: `stack_user_123_${Math.random()}`,
        primary_email: email,
        display_name: input.name,
      }
      vi.mocked(stackServerApp.createUser).mockResolvedValue({
        toClientJson: () => mockNewStackUser,
      } as any)

      await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUserWithoutName
      )

      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          inviterName: undefined,
        })
      )
    })

    it("should handle invitations for new users when the invitee's name is not provided", async () => {
      const email = `newuser-${Math.random()}@test.com`
      const input = { email }
      const mockNewStackUser = {
        id: `stack_user_123_${Math.random()}`,
        primary_email: email,
        display_name: null,
      }
      vi.mocked(stackServerApp.createUser).mockResolvedValue({
        toClientJson: () => mockNewStackUser,
      } as any)

      await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input as any,
        inviterUser
      )

      expect(stackServerApp.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: undefined,
        })
      )
    })
  })

  describe('Existing User Invitation', () => {
    it('should add an existing user to the organization if they are not already a member', async () => {
      const { organization: otherOrg } = await setupOrg()
      const { user: existingUser } = await setupUserAndApiKey({
        organizationId: otherOrg.id,
        livemode: true,
      })
      const input = { email: existingUser.email! }

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser
      )

      expect(stackServerApp.createUser).not.toHaveBeenCalled()
      expect(sendOrganizationInvitationEmail).not.toHaveBeenCalled()

      await adminTransaction(async ({ transaction }) => {
        const memberships = await selectMemberships(
          {
            userId: existingUser.id,
            organizationId: organization.id,
          },
          transaction
        )
        expect(memberships).toHaveLength(1)
        expect(memberships[0].focused).toBe(false)
        expect(memberships[0].livemode).toBe(true)
      })

      expect(result).toBeUndefined()
      await teardownOrg({ organizationId: otherOrg.id })
    })

    it('should do nothing if the existing user is already a member of the organization', async () => {
      const { user: existingUser } = await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
      const input = { email: existingUser.email! }

      await adminTransaction(async ({ transaction }) => {
        const memberships = await selectMemberships(
          {
            userId: existingUser.id,
            organizationId: organization.id,
          },
          transaction
        )
        expect(memberships.length).toBeGreaterThan(0)
      })

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser
      )

      expect(stackServerApp.createUser).not.toHaveBeenCalled()
      expect(sendOrganizationInvitationEmail).not.toHaveBeenCalled()

      await adminTransaction(async ({ transaction }) => {
        const memberships = await selectMemberships(
          {
            userId: existingUser.id,
            organizationId: organization.id,
          },
          transaction
        )
        expect(memberships).toHaveLength(1)
      })

      expect(result).toBeUndefined()
    })
  })
})
