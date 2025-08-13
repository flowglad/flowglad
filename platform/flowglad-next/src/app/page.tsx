import { adminTransaction } from '@/db/adminTransaction'
import { UserRecord } from '@/db/schema/users'
import {
  selectMembershipAndOrganizations,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import { auth } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import { inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    throw new Error('User not authenticated')
  }
  const { user: betterAuthUser } = session
  const email = betterAuthUser.email
  if (!email) {
    throw new Error('User email not found')
  }
  const user = await betterAuthUserToApplicationUser(betterAuthUser)
  const result = await adminTransaction(async ({ transaction }) => {
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
      return {
        focusedMembershipAndOrganization: focusedMembership,
        membershipsAndOrganizations,
      }
    } else if (membershipsAndOrganizations.length > 0) {
      await updateMembership(
        {
          id: membershipsAndOrganizations[0].membership.id,
          focused: true,
        },
        transaction
      )
      return {
        focusedMembershipAndOrganization:
          membershipsAndOrganizations[0],
        membershipsAndOrganizations,
      }
    }
    return {
      focusedMembershipAndOrganization: null,
      membershipsAndOrganizations,
    }
  })

  const {
    focusedMembershipAndOrganization,
    membershipsAndOrganizations,
  } = result
  if (membershipsAndOrganizations.length === 0) {
    redirect('/onboarding/business-details')
  } else if (focusedMembershipAndOrganization) {
    redirect('/dashboard')
  } else {
    redirect('/select-organization')
  }
}
