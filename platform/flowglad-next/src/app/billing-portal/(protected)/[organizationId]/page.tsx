import { Result } from 'better-result'
import { redirect } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { getCustomerSession } from '@/utils/auth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'

interface BillingPortalRedirectPageProps {
  params: Promise<{
    organizationId: string
  }>
}

const BillingPortalRedirectPage = async ({
  params,
}: BillingPortalRedirectPageProps) => {
  const { organizationId } = await params
  // Use customer session for billing portal - not merchant session
  const session = await getCustomerSession()
  if (!session) {
    redirect(`/billing-portal/${organizationId}/sign-in`)
  }
  const user = await betterAuthUserToApplicationUser(session.user)
  // Use adminTransaction since customer billing portal users don't have merchant RLS context.
  // Security is enforced by customerSessionProcedure (validates user session + organizationId)
  // and the query filter (userId + organizationId + livemode).
  const customers = (
    await authenticatedTransaction(async ({ transaction }) => {
      return Result.ok(
        await selectCustomers(
          { userId: user.id, organizationId, livemode: true },
          transaction
        )
      )
    })
  ).unwrap()
  if (customers.length === 0) {
    return <div>No customers found</div>
  } else if (customers.length === 1) {
    redirect(`/billing-portal/${organizationId}/${customers[0].id}`)
  } else {
    redirect(`/billing-portal/${organizationId}/select-customer`)
  }
}

export default BillingPortalRedirectPage
