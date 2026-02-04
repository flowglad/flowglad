'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { trpc } from '@/app/_trpc/client'

/**
 * Billing portal logout page.
 * Handles customer logout and redirects to the sign-in page for the organization.
 */
export default function BillingPortalLogout() {
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

      isLoggingOut.current = true

      const redirectParam = searchParams.get('redirect')

      // Perform customer logout
      // Even if logout fails (network error, server error), redirect anyway.
      // The user's intent is to log out and navigate - if session clearing
      // failed server-side, re-authenticating will either work normally
      // (session was actually cleared) or create a fresh session.
      try {
        await logoutCustomerMutation.mutateAsync()
      } catch (error) {
        console.error('Customer logout failed:', error)
      }

      // Redirect to the specified URL or default sign-in page
      if (
        redirectParam &&
        redirectParam.startsWith('/billing-portal/')
      ) {
        router.replace(redirectParam)
      } else {
        // Default: go back to billing portal sign-in
        // Try to extract organizationId from the referrer or just go to root
        router.replace('/billing-portal')
      }
    }
    performLogout()
  }, [searchParams, logoutCustomerMutation, router])

  return null
}
