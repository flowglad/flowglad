import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { adminTransaction } from '@/db/adminTransaction'
import { z } from 'zod'
import {
  selectFocusedMembershipAndOrganization,
  selectMemberships,
} from '@/db/tableMethods/membershipMethods'
import {
  insertUser,
  selectUserById,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import {
  inviteUserToOrganizationSchema,
  Membership,
} from '@/db/schema/memberships'
import { sendOrganizationInvitationEmail } from '@/utils/email'
import { Organization } from '@/db/schema/organizations'
import { auth } from '@/utils/auth'
import core from '@/utils/core'

export const innerInviteUserToOrganizationHandler = async (
  focusedMembership: {
    organization: Pick<Organization.Record, 'id' | 'name'>
    membership: Pick<Membership.Record, 'livemode' | 'userId'>
  },
  input: {
    email: string
    name?: string
  },
  inviterUser: {
    name: string | null
  }
) => {
  // Use admin transaction to find user by email
  const [userForEmail] = await adminTransaction(
    async ({ transaction }) => {
      return selectUsers({ email: input.email }, transaction)
    }
  )

  if (!userForEmail) {
    await adminTransaction(async ({ transaction }) => {
      const databaseUser = await insertUser(
        {
          id: `user_${core.nanoid()}`,
          email: input.email,
          name: input.name ?? '',
        },
        transaction
      )
      await insertMembership(
        {
          userId: databaseUser.id,
          organizationId: focusedMembership.organization.id,
          focused: false,
          livemode: focusedMembership.membership.livemode,
        },
        transaction
      )
    })
    await sendOrganizationInvitationEmail({
      to: [input.email],
      organizationName: focusedMembership.organization.name,
      inviterName: inviterUser.name ?? undefined,
    })
    return {
      success: true,
      message: 'User created and invited to organization',
    }
  }

  // Insert membership for the user
  await adminTransaction(async ({ transaction, livemode }) => {
    const membershipForUser = await selectMemberships(
      {
        userId: userForEmail.id,
        organizationId: focusedMembership.organization.id,
      },
      transaction
    )
    if (membershipForUser.length > 0) {
      return
    }
    return insertMembership(
      {
        userId: userForEmail.id,
        organizationId: focusedMembership.organization.id,
        focused: false,
        livemode,
      },
      transaction
    )
  })
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
          const user = await selectUserById(
            focusedMembership.membership.userId,
            transaction
          )
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
