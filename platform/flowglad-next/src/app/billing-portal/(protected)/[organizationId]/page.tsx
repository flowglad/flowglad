import { Result } from 'better-result'
import { redirect } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { getSession } from '@/utils/auth'
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
  const session = await getSession()
  if (!session) {
    redirect(`/billing-portal/${organizationId}/sign-in`)
  }
  const user = await betterAuthUserToApplicationUser(session.user)
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
