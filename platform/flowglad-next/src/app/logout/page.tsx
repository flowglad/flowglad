'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { trpc } from '@/app/_trpc/client'

/**
 * Checks if a redirect URL is a valid billing portal URL.
 */
function isBillingPortalRedirect(url: string): boolean {
  try {
    return (
      url.startsWith('/billing-portal/org_') && !url.includes('..')
    )
  } catch {
    return false
  }
}

/**
 * Logout page that handles both merchant and customer logouts.
 * Uses the appropriate logout mutation based on the redirect URL:
 * - If redirecting to billing portal: uses logoutCustomer
 * - Otherwise: uses logoutMerchant
 */
export default function Logout() {
  const logoutMerchantMutation =
    trpc.utils.logoutMerchant.useMutation()
  const logoutCustomerMutation =
    trpc.utils.logoutCustomer.useMutation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isLoggingOut = useRef(false)

  useEffect(() => {
    const performLogout = async () => {
      // Prevent duplicate logout calls
      if (isLoggingOut.current) {
        return
      }

      const redirectParam = searchParams.get('redirect')
      const isBillingPortal =
        redirectParam && isBillingPortalRedirect(redirectParam)

      isLoggingOut.current = true

      // Use the appropriate logout mutation based on context
      if (isBillingPortal) {
        await logoutCustomerMutation.mutateAsync()
        router.replace(redirectParam)
      } else {
        await logoutMerchantMutation.mutateAsync()
        router.replace('/sign-in')
      }
    }
    performLogout()
  }, [
    searchParams,
    logoutMerchantMutation,
    logoutCustomerMutation,
    router,
  ])
  return null
}
