import { getSession } from '@/utils/auth'
import { redirect } from 'next/navigation'

export default async function BillingPortalProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ organizationId?: string; customerId?: string }>
}) {
  const session = await getSession()
  const resolvedParams = await params

  if (!session) {
    // Redirect to appropriate sign-in page based on available params
    if (resolvedParams.organizationId && resolvedParams.customerId) {
      redirect(
        `/billing-portal/${resolvedParams.organizationId}/${resolvedParams.customerId}/sign-in`
      )
    } else if (resolvedParams.organizationId) {
      redirect(`/billing-portal/${resolvedParams.organizationId}/sign-in`)
    } else {
      // Fallback to root if no params available
      redirect('/billing-portal')
    }
  }

  return <>{children}</>
}
