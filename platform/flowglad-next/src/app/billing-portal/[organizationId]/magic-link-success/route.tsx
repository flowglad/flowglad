import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { redirect } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) => {
  const session = await getSession()
  if (!session) {
    return NextResponse.json(
      { error: 'No session found' },
      { status: 401 }
    )
  }

  const user = await betterAuthUserToApplicationUser(session.user)
  const { organizationId } = await params
  const customers = await adminTransaction(
    async ({ transaction }) => {
      return selectCustomers(
        { userId: user.id, organizationId },
        transaction
      )
    }
  )

  if (customers.length === 0) {
    await clearCustomerBillingPortalOrganizationId()
    return NextResponse.json(
      { error: 'No customers found for this user' },
      { status: 404 }
    )
  }

  return NextResponse.redirect(
    new URL(`/billing-portal/${organizationId}`, request.url)
  )
}
