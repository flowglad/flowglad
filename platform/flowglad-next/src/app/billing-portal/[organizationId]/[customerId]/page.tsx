import { redirect } from 'next/navigation'
import { getSession } from '@/utils/auth'
import InternalBillingPortalPage from './Internal'

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
  const session = await getSession()

  // If no session, redirect to OTP sign-in page
  if (!session) {
    redirect(
      `/billing-portal/${organizationId}/${customerId}/sign-in`
    )
  }

  return <InternalBillingPortalPage />
}
