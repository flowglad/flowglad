import { z } from 'zod'
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
} from '@/db/tableMethods/membershipMethods'
import {
  insertUser,
  selectUserById,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import { protectedProcedure } from '@/server/trpc'
import { auth } from '@/utils/auth'
import core from '@/utils/core'
import { sendOrganizationInvitationEmail } from '@/utils/email'

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
  const [userForEmail] = (
    await adminTransaction(async ({ transaction }) => {
      return selectUsers({ email: input.email }, transaction)
    })
  ).unwrap()

  if (!userForEmail) {
    ;(
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
    ).unwrap()
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
  ;(
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
  ).unwrap()
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
    const { focusedMembership, user: inviterUser } = (
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
    ).unwrap()
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
