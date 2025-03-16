import { db } from '@/db/client'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { upsertUserById } from '@/db/tableMethods/userMethods'
import { stackServerApp } from '@/stack'
import { currentUser } from '@clerk/nextjs/server'
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
      await upsertUserById(
        {
          id: user.id,
          name: user.displayName ?? undefined,
          email,
        },
        transaction
      )
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
