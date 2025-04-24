import { stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'

interface BillingPortalPageProps {
  params: Promise<{
    organizationId: string
    customerId: string
  }>
}

export default async function BillingPortalPage({
  params,
}: BillingPortalPageProps) {
  const { organizationId, customerId } = await params
  const user = await stackServerApp.getUser()

  if (user) {
    return redirect(`/billing/${organizationId}/${customerId}/manage`)
  }

  return redirect(`/billing/${organizationId}/${customerId}/sign-in`)
}
