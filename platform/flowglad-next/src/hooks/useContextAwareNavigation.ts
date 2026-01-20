'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { getParentRoute } from '@/config/routeHierarchy'

/**
 * Hook for context-aware navigation on org/livemode switches.
 *
 * When the user switches organizations or toggles livemode while on a detail page
 * (e.g., /customers/abc123), the resource may not exist in the new context,
 * resulting in a 404. This hook provides a function to navigate "up" to the
 * parent list page instead.
 *
 * @example
 * ```tsx
 * const { navigateToParentIfNeeded } = useContextAwareNavigation()
 *
 * const handleOrgSwitch = async (orgId: string) => {
 *   await switchOrganization(orgId)
 *   navigateToParentIfNeeded()
 * }
 * ```
 */
export function useContextAwareNavigation() {
  const pathname = usePathname()
  const router = useRouter()

  /**
   * If the current page is a detail page, navigate to its parent list page.
   * This should be called after switching org/livemode to prevent 404s.
   *
   * @returns true if navigation occurred, false otherwise
   */
  const navigateToParentIfNeeded = useCallback((): boolean => {
    const parentRoute = getParentRoute(pathname)
    if (parentRoute) {
      router.push(parentRoute)
      return true
    }
    return false
  }, [pathname, router])

  /**
   * Get the parent route for the current page without navigating.
   * Useful for conditional logic or displaying breadcrumbs.
   */
  const getParent = useCallback((): string | null => {
    return getParentRoute(pathname)
  }, [pathname])

  /**
   * Check if the current page is a detail page that needs redirection on context switch.
   */
  const isDetailPage = useCallback((): boolean => {
    return getParentRoute(pathname) !== null
  }, [pathname])

  return {
    navigateToParentIfNeeded,
    getParent,
    isDetailPage,
    currentPathname: pathname,
  }
}
