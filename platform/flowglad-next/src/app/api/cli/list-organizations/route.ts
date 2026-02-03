import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { adminTransaction } from '@/db/adminTransaction'
import { selectMembershipAndOrganizationsByBetterAuthUserId } from '@/db/tableMethods/membershipMethods'
import { auth } from '@/utils/auth'

export const runtime = 'nodejs'

export interface ListOrganizationsResponse {
  organizations: Array<{
    id: string
    name: string
    createdAt: string
  }>
}

export async function GET(): Promise<NextResponse> {
  // Get Better Auth session from Authorization header (refresh token)
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired session',
      },
      { status: 401 }
    )
  }

  const betterAuthUserId = session.user.id

  const organizations = await adminTransaction(
    async ({ transaction }) => {
      // Get memberships and orgs - deactivated memberships are filtered out by default
      const memberships =
        await selectMembershipAndOrganizationsByBetterAuthUserId(
          betterAuthUserId,
          transaction
        )

      return memberships.map(({ organization }) => ({
        id: organization.id,
        name: organization.name,
        createdAt: new Date(organization.createdAt).toISOString(),
      }))
    },
    { livemode: false }
  )

  const response: ListOrganizationsResponse = { organizations }
  return NextResponse.json(response)
}
