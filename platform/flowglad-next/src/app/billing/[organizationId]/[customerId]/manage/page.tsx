import { adminTransaction } from '@/db/adminTransaction'
import { selectCustomers } from '@/db/tableMethods/customerMethods'
import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'

interface BillingPortalManagePageProps {
  params: Promise<{
    organizationId: string
    customerId: string
  }>
}

export default async function BillingPortalManagePage({
  params,
}: BillingPortalManagePageProps) {
  const { organizationId, customerId } = await params
  const user = await stackServerApp.getUser()

  if (!user) {
    return redirect(
      `/billing/${organizationId}/${customerId}/sign-in`
    )
  }

  const customer = await adminTransaction(async ({ transaction }) => {
    return await selectCustomers(
      { id: customerId, organizationId },
      transaction
    )
  })

  if (customer.length === 0) {
    return redirect(
      `/billing/${organizationId}/${customerId}/sign-in`
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Hello Billing World!</h1>
      <p>Organization ID: {organizationId}</p>
      <p>Customer ID: {customerId}</p>
    </div>
  )
}
