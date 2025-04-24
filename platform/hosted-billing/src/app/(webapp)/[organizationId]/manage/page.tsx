import { flowgladServer } from '@/flowglad'
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
      `/billing/${organizationId}/sign-in?externalId=${encodeURIComponent(customerId)}`
    )
  }

  const customer = await flowgladServer.getCustomer()

  if (!customer) {
    return redirect(
      `/billing/${organizationId}/sign-in?externalId=${encodeURIComponent(customerId)}`
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
