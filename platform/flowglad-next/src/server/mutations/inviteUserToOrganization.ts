import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  inviteUserToOrganizationSchema,
  type Membership,
} from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import {
  insertMembership,
  selectFocusedMembershipAndOrganization,
  selectMemberships,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import {
  insertUser,
  selectUserById,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import { protectedProcedure } from '@/server/trpc'
import { MembershipRole } from '@/types'
import core from '@/utils/core'
import { sendOrganizationInvitationEmail } from '@/utils/email'

type InviteAction = 'created' | 'reactivated' | 'already_member'

export const innerInviteUserToOrganizationHandler = async (
  focusedMembership: {
    organization: Pick<Organization.Record, 'id' | 'name'>
    membership: Pick<Membership.Record, 'userId'>
  },
  input: {
    email: string
    name?: string
  },
  inviterUser: {
    name: string | null
  }
): Promise<{ action: InviteAction }> => {
  // Use admin transaction to find user by email
  const [userForEmail] = await adminTransaction(
    async ({ transaction }) => {
      return selectUsers({ email: input.email }, transaction)
    }
  )

  if (!userForEmail) {
    // Create new user and membership
    await adminTransaction(async ({ transaction }) => {
      const databaseUser = await insertUser(
        {
          id: `user_${core.nanoid()}`,
          email: input.email,
          name: input.name ?? '',
        },
        transaction
      )
      // New memberships default to test mode (livemode: false)
      // to ensure safe onboarding before production access
      await insertMembership(
        {
          userId: databaseUser.id,
          organizationId: focusedMembership.organization.id,
          focused: false,
          livemode: false,
          role: MembershipRole.Member,
        },
        transaction
      )
    })
    await sendOrganizationInvitationEmail({
      to: [input.email],
      organizationName: focusedMembership.organization.name,
      inviterName: inviterUser.name ?? undefined,
    })
    return { action: 'created' }
  }

  // Check for existing membership (including deactivated)
  const action = await adminTransaction(
    async ({ transaction }): Promise<InviteAction> => {
      const membershipForUser = await selectMemberships(
        {
          userId: userForEmail.id,
          organizationId: focusedMembership.organization.id,
        },
        transaction,
        { includeDeactivated: true }
      )
      if (membershipForUser.length > 0) {
        const existingMembership = membershipForUser[0]
        // If membership was deactivated, reactivate it
        if (existingMembership.deactivatedAt) {
          await updateMembership(
            {
              id: existingMembership.id,
              deactivatedAt: null,
            },
            transaction
          )
          return 'reactivated'
        }
        // Already an active member
        return 'already_member'
      }
      // Create new membership for existing user
      // New memberships default to test mode (livemode: false)
      // to ensure safe onboarding before production access
      await insertMembership(
        {
          userId: userForEmail.id,
          organizationId: focusedMembership.organization.id,
          focused: false,
          livemode: false,
          role: MembershipRole.Member,
        },
        transaction
      )
      return 'created'
    }
  )

  // Send email for all new/reactivated memberships (not if already an active member)
  if (action !== 'already_member') {
    await sendOrganizationInvitationEmail({
      to: [input.email],
      organizationName: focusedMembership.organization.name,
      inviterName: inviterUser.name ?? undefined,
    })
  }

  return { action }
}

/**
 * Invites a user to an organization.
 * If the user doesn't exist, it creates a new user and inserts a membership for them.
 * If the user exists, it inserts a membership
 * for them for the inviting user's focused organization,
 * if they are not already a member.
 */
export const inviteUserToOrganization = protectedProcedure
  .input(inviteUserToOrganizationSchema)
  .mutation(async ({ input, ctx }) => {
    // Get focused membership to get organization ID
    const { focusedMembership, user: inviterUser } =
      await authenticatedTransaction(
        async ({ transaction, userId }) => {
          const focusedMembership =
            await selectFocusedMembershipAndOrganization(
              userId,
              transaction
            )
          const user = (
            await selectUserById(
              focusedMembership.membership.userId,
              transaction
            )
          ).unwrap()
          return { focusedMembership, user }
        },
        {
          apiKey: ctx.apiKey,
        }
      )
    await innerInviteUserToOrganizationHandler(
      focusedMembership,
      input,
      inviterUser
    )
    return {
      success: true,
      message: 'User invited to organization',
    }
  })
