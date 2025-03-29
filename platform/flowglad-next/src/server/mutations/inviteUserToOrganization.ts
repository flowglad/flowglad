import { protectedProcedure } from '@/server/trpc'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { adminTransaction } from '@/db/databaseMethods'
import { z } from 'zod'
import {
  selectFocusedMembershipAndOrganization,
  selectMemberships,
} from '@/db/tableMethods/membershipMethods'
import {
  insertUser,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import { insertMembership } from '@/db/tableMethods/membershipMethods'
import { stackServerApp } from '@/stack'
import { inviteUserToOrganizationSchema } from '@/db/schema/memberships'

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
    const focusedMembership = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        return selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    // Use admin transaction to find user by email
    const [userForEmail] = await adminTransaction(
      async ({ transaction }) => {
        return selectUsers({ email: input.email }, transaction)
      }
    )

    if (!userForEmail) {
      const result = await stackServerApp.createUser({
        primaryEmail: input.email,
        displayName: input.name,
      })
      const stackAuthUser = result.toClientJson()
      await adminTransaction(async ({ transaction }) => {
        const databaseUser = await insertUser(
          {
            id: stackAuthUser.id,
            email: stackAuthUser.primary_email,
            name: stackAuthUser.display_name,
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
      if (membershipForUser) {
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

    return {
      success: true,
      message: 'User invited to organization',
    }
  })
