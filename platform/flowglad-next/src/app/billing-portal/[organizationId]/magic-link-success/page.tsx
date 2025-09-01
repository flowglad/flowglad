import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import { clearCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { redirect } from 'next/navigation'

const MagicLinkSuccessPage = async ({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) => {
  const session = await getSession()
  if (!session) {
    return <div>No session found</div>
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
    return <div>No customers found for this user</div>
  }

  redirect(`/billing-portal/${organizationId}`)
}

export default MagicLinkSuccessPage
