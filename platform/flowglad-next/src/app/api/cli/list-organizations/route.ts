import { Result } from 'better-result'
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

type OrganizationInfo = {
  id: string
  name: string
  createdAt: string
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

  const result = await adminTransaction(
    async ({
      transaction,
    }): Promise<Result<OrganizationInfo[], Error>> => {
      // Get memberships and orgs - deactivated memberships are filtered out by default
      const memberships =
        await selectMembershipAndOrganizationsByBetterAuthUserId(
          betterAuthUserId,
          transaction
        )

      const organizations = memberships.map(({ organization }) => ({
        id: organization.id,
        name: organization.name,
        createdAt: new Date(organization.createdAt).toISOString(),
      }))

      return Result.ok(organizations)
    },
    { livemode: false }
  )

  if (Result.isError(result)) {
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: result.error.message,
      },
      { status: 500 }
    )
  }

  const response: ListOrganizationsResponse = {
    organizations: result.value,
  }
  return NextResponse.json(response)
}
