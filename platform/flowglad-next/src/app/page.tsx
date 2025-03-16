import { db } from '@/db/client'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import { memberships } from '@/db/schema/memberships'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  selectUsers,
  upsertUserById,
} from '@/db/tableMethods/userMethods'
import { stackServerApp } from '@/stack'
import { eq } from 'drizzle-orm'
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

  const membershipsAndOrganizations = await adminTransaction(
    async ({ transaction }) => {
      const [existingUser] = await selectUsers(
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
      if (existingUser) {
        await transaction
          .update(memberships)
          .set({
            userId: user.id,
          })
          .where(eq(memberships.userId, user.id))
      }
      return selectMembershipAndOrganizations(
        {
          userId: user.id,
        },
        transaction
      )
    }
  )
  if (membershipsAndOrganizations.length === 0) {
    redirect('/onboarding/business-details')
  }
  redirect('/dashboard')
}
