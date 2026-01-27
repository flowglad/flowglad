import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/utils/auth'

/**
 * Layout for protected billing portal routes that guards against unauthenticated access.
 * If no session exists, redirects to the appropriate sign-in page.
 *
 * The redirect URL is constructed based on the current path:
 * - /billing-portal/[organizationId]/[customerId]/... → /billing-portal/[organizationId]/[customerId]/sign-in
 * - /billing-portal/[organizationId]/... → /billing-portal/[organizationId]/sign-in
 */
export default async function BillingPortalProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    // Get the current pathname from headers to construct the appropriate sign-in URL
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') || ''

    // Parse the path to extract organizationId and customerId
    // Path format: /billing-portal/[organizationId]/[customerId]/...
    const pathParts = pathname.split('/').filter(Boolean)
    // pathParts: ['billing-portal', 'org_xxx', 'cust_xxx', ...]
    const organizationId = pathParts[1]
    const customerId = pathParts[2]

    // Construct the redirect URL based on available path segments
    if (customerId && organizationId) {
      redirect(
        `/billing-portal/${organizationId}/${customerId}/sign-in`
      )
    } else if (organizationId) {
      redirect(`/billing-portal/${organizationId}/sign-in`)
    } else {
      // Fallback to main sign-in if no organizationId found
      redirect('/sign-in')
    }
  }

  return <>{children}</>
}
