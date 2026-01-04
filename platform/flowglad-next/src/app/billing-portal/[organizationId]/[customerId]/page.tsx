import { redirect } from 'next/navigation'
import { getSession } from '@/utils/auth'
import InternalBillingPortalPage from './Internal'

interface BillingPortalRedirectPageProps {
  params: Promise<{
    organizationId: string
    customerId: string
  }>
}
export default async ({ params }: BillingPortalRedirectPageProps) => {
  const { organizationId, customerId } = await params
  const session = await getSession()

  if (!session) {
    redirect(
      `/billing-portal/${organizationId}/${customerId}/sign-in`
    )
  }

  return <InternalBillingPortalPage />
}
