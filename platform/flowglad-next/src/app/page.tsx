import { adminTransaction } from '@/db/databaseMethods'
import { memberships } from '@/db/schema/memberships'
import {
  selectMembershipAndOrganizations,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import {
  selectUsers,
  upsertUserById,
} from '@/db/tableMethods/userMethods'
import { stackServerApp } from '@/stack'
import { inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'

export default async function Home() {
  const user = await stackServerApp.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }
  const email = user.primaryEmail
  if (!email) {
    throw new Error('User email not found')
  }
  const membershipsAndOrganization = await adminTransaction(
    async ({ transaction }) => {
      /**
       * Upsert flow:
       * - get users with the same email as the current one
       * - if no users are found, create a new user
       * - if existing users are found with the same email,
       *   update the user id of their memberships to match
       *   the id of the current user
       * - if no memberships exist for the current user,
       *   redirect them to onboarding.
       */
      const existingUsers = await selectUsers(
        {
          email,
        },
        transaction
      )
      await upsertUserById(
        {
          id: user.id,
          name: user.displayName ?? undefined,
          email,
        },
        transaction
      )
      /**
       * If the user already exists (aka they signed up before the stack auth migration),
       * update their existing memberships to point to the new user id.
       */
      if (existingUsers.length > 0) {
        await transaction
          .update(memberships)
          .set({
            userId: user.id,
          })
          .where(
            inArray(
              memberships.userId,
              existingUsers.map((user) => user.id)
            )
          )
      }
      const membershipsAndOrganizations =
        await selectMembershipAndOrganizations(
          {
            userId: user.id,
          },
          transaction
        )
      const focusedMembership = membershipsAndOrganizations.find(
        (item) => item.membership.focused
      )
      if (focusedMembership) {
        return focusedMembership
      } else if (membershipsAndOrganizations.length > 0) {
        await updateMembership(
          {
            id: membershipsAndOrganizations[0].membership.id,
            focused: true,
          },
          transaction
        )
        return membershipsAndOrganizations[0]
      }
    }
  )
  if (!membershipsAndOrganization) {
    redirect('/onboarding/business-details')
  }
  redirect('/dashboard')
}
