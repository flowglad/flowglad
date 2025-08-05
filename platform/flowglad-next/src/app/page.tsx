import { adminTransaction } from '@/db/adminTransaction'
import { UserRecord } from '@/db/schema/users'
import {
  selectMembershipAndOrganizations,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import { auth } from '@/utils/auth'
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
  const result = await adminTransaction(async ({ transaction }) => {
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
    let user: UserRecord | null = null
    if (existingUsers.length === 0) {
      user = await insertUser(
        {
          id: betterAuthUser.id,
          name: betterAuthUser.name ?? undefined,
          email,
          betterAuthId: betterAuthUser.id,
        },
        transaction
      )
    } else {
      user = existingUsers[0]
    }
    if (!user) {
      throw new Error('User not found')
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
