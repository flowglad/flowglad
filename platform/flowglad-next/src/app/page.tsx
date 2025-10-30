import { adminTransaction } from '@/db/adminTransaction'
import {
  selectMembershipAndOrganizations,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await getSession()

  if (!session) {
    throw new Error('User not authenticated')
  }
  const { user: betterAuthUser } = session
  const email = betterAuthUser.email
  if (!email) {
    throw new Error('User email not found')
  }
  const user = await betterAuthUserToApplicationUser(betterAuthUser)
  const membershipsAndOrganizations = await adminTransaction(
    async ({ transaction }) => {
      const memberships = await selectMembershipAndOrganizations(
        { userId: user.id },
        transaction
      )

      // Ensure at least one membership is focused so the UI always has context
      const hasFocused = memberships.some(
        (item) => item.membership.focused
      )
      if (!hasFocused && memberships.length > 0) {
        await updateMembership(
          { id: memberships[0].membership.id, focused: true },
          transaction
        )
      }

      return memberships
    }
  )

  if (membershipsAndOrganizations.length === 0) {
    redirect('/onboarding/business-details')
  }

  redirect('/dashboard')
}
