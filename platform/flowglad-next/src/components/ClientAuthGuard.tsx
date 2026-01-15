'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthContext } from '@/contexts/authContext'

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
 * Skeleton component for a single chart section (large/primary chart)
 */
const ChartSkeleton = () => {
  return (
    <div className="w-full relative flex flex-col">
      {/* Chart title */}
      <div className="flex flex-row gap-2 justify-between px-page">
        <Skeleton className="h-5 w-32" />
      </div>
      {/* Chart value */}
      <div className="px-page mt-1">
        <Skeleton className="w-36 h-7" />
      </div>
      {/* Chart area */}
      <div className="mt-3 flex items-center">
        <Skeleton className="h-60 w-full" />
      </div>
    </div>
  )
}

/**
 * Specialized loading fallback for dashboard-style pages.
 * Uses the same layout classes as PageContainer to prevent width shift
 * when transitioning from loading to loaded state.
 */
export const DashboardLoadingFallback = () => {
  return (
    <div className="h-full w-full flex-1 flex flex-col md:border-r md:border-dashed border-sidebar-border">
      {/* PageHeaderNew skeleton */}
      <div className="flex flex-col items-start justify-center w-full px-page pt-20 pb-2">
        {/* Headline wrapper */}
        <div className="flex flex-col gap-1 items-start w-full">
          {/* Page title skeleton - "Hello, [Name]" */}
          <Skeleton className="h-8 w-48" />
        </div>
        {/* Description / DateRangePicker skeleton */}
        <div className="flex flex-wrap items-center gap-2 w-full px-0 py-2">
          <Skeleton className="h-8 w-64" />
        </div>
      </div>

      {/* Charts container */}
      <div className="w-full flex flex-col pb-16">
        {/* Primary Chart skeleton */}
        <div className="py-6">
          <ChartSkeleton />
        </div>
        {/* Divider */}
        <div className="w-full border-t border-dashed border-border" />
        {/* Secondary Charts grid */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="py-6 md:border-r md:border-dashed md:border-border">
            <ChartSkeletonSmall />
          </div>
          <div className="py-6 max-md:border-t max-md:border-dashed max-md:border-border">
            <ChartSkeletonSmall />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Small chart skeleton for secondary charts in the grid
 */
const ChartSkeletonSmall = () => {
  return (
    <div className="w-full relative flex flex-col">
      {/* Chart title */}
      <div className="flex flex-row gap-2 justify-between px-page">
        <Skeleton className="h-5 w-32" />
      </div>
      {/* Chart value */}
      <div className="px-page mt-1">
        <Skeleton className="w-24 h-5" />
      </div>
      {/* Chart area */}
      <div className="mt-3 flex items-center">
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}
