'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthContext } from '@/contexts/authContext'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'

type AuthGuardProps = {
  children: React.ReactNode
  requireAuth?: boolean
  requireOrganization?: boolean
  redirectTo?: string
  fallbackComponent?: React.ReactNode
}

/**
 * Client-side authentication guard that provides smooth navigation
 * without server-side redirects that cause page reloads
 */
export const ClientAuthGuard = ({
  children,
  requireAuth = true,
  requireOrganization = true,
  redirectTo,
  fallbackComponent,
}: AuthGuardProps) => {
  const { authenticated, organization, authenticatedLoading } =
    useAuthContext()
  const router = useRouter()
  useEffect(() => {
    if (authenticatedLoading) {
      return
    }
    // Wait for auth context to be fully loaded, then redirect to sign-in
    // if not authenticated
    if (!authenticated && requireAuth) {
      router.push(redirectTo || '/sign-in')
      return
    }

    if (!organization && requireOrganization && authenticated) {
      router.push(redirectTo || '/onboarding/business-details')
      return
    }
  }, [
    authenticated,
    organization,
    authenticatedLoading,
    requireAuth,
    requireOrganization,
    redirectTo,
    router,
  ])

  // Show loading state while auth is being determined
  if (requireAuth && !authenticated) {
    return fallbackComponent || <AuthLoadingFallback />
  }

  if (requireOrganization && !organization && authenticated) {
    return fallbackComponent || <AuthLoadingFallback />
  }

  // Auth checks passed, render children
  return <>{children}</>
}

/**
 * Default loading fallback that matches your design system
 */
const AuthLoadingFallback = () => {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          Loading...
        </div>
      </div>
    </div>
  )
}

/**
 * Specialized loading fallback for dashboard-style pages
 */
export const DashboardLoadingFallback = () => {
  return (
    <div className="flex flex-col gap-4 p-4 w-full">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
