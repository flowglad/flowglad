import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { getSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import { redirect } from 'next/navigation'

interface BillingPortalRedirectPageProps {
  params: Promise<{
    organizationId: string
  }>
}

const BillingPortalRedirectPage = async ({
  params,
}: BillingPortalRedirectPageProps) => {
  const { organizationId } = await params
  const session = await getSession()
  if (!session) {
    throw new Error('User not authenticated')
  }
  const user = await betterAuthUserToApplicationUser(session.user)
  const customers = await authenticatedTransaction(
    async ({ transaction }) => {
      return selectCustomers(
        { userId: user.id, organizationId },
        transaction
      )
    }
  )
  if (customers.length === 0) {
    return <div>No customers found</div>
  } else if (customers.length === 1) {
    redirect(`/billing-portal/${organizationId}/${customers[0].id}`)
  } else {
    redirect(`/billing-portal/${organizationId}/select-customer`)
  }
}

export default BillingPortalRedirectPage
