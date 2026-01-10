import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { type Membership, memberships } from '@/db/schema/memberships'
import {
  type Organization,
  organizations,
} from '@/db/schema/organizations'
import { type User, users } from '@/db/schema/users'
import { selectMemberships } from '@/db/tableMethods/membershipMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import { sendOrganizationInvitationEmail } from '@/utils/email'
import { innerInviteUserToOrganizationHandler } from './inviteUserToOrganization'

vi.mock('@/utils/email', () => ({
  sendOrganizationInvitationEmail: vi.fn(),
}))

describe('innerInviteUserToOrganizationHandler', () => {
  let organization: Organization.Record
  let inviterUser: User.Record
  let focusedMembership: {
    organization: Pick<Organization.Record, 'id' | 'name'>
    membership: Pick<Membership.Record, 'livemode' | 'userId'>
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

      const result = await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser
      )

      expect(sendOrganizationInvitationEmail).toHaveBeenCalledWith({
        to: [email],
        organizationName: organization.name,
        inviterName: inviterUser.name ?? undefined,
      })

      await adminTransaction(async ({ transaction }) => {
        const [newUser] = await selectUsers({ email }, transaction)
        expect(typeof newUser).toBe('object')
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
      await innerInviteUserToOrganizationHandler(
        focusedMembership,
        input,
        inviterUser
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
