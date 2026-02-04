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

      // Use the appropriate logout mutation based on context.
      // Even if logout fails (network error, server error), redirect anyway.
      // The user's intent is to log out and navigate - if session clearing
      // failed server-side, re-authenticating will either work normally
      // (session was actually cleared) or create a fresh session.
      if (isBillingPortal) {
        try {
          await logoutCustomerMutation.mutateAsync()
        } catch (error) {
          console.error('Customer logout failed:', error)
        }
        router.replace(redirectParam)
      } else {
        try {
          await logoutMerchantMutation.mutateAsync()
        } catch (error) {
          console.error('Merchant logout failed:', error)
        }
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
