'use client'

import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { useAuthContext } from '@/contexts/authContext'
import { useContextAwareNavigation } from '@/hooks/useContextAwareNavigation'

/**
 * Hook to manage organization list and switching.
 * Extracted from OrganizationSwitcher to be reusable in NavUser submenu.
 */
export const useOrganizationList = () => {
  const router = useRouter()
  const { organization: currentOrganization } = useAuthContext()
  const { invalidate: invalidateTRPC } = trpc.useUtils()
  const { navigateToParentIfNeeded } = useContextAwareNavigation()

  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()

  const organizationsQuery =
    trpc.organizations.getOrganizations.useQuery()

  const updateFocusedMembership =
    trpc.organizations.updateFocusedMembership.useMutation({
      onSuccess: async () => {
        await invalidateTRPC()
        await focusedMembership.refetch()
        // Navigate to parent page if on a detail page to avoid 404s after org switch
        navigateToParentIfNeeded()
        router.refresh()
      },
    })

  const switchOrganization = async (organizationId: string) => {
    if (organizationId !== currentOrganization?.id) {
      await updateFocusedMembership.mutateAsync({
        organizationId,
      })
    }
  }

  return {
    organizations: organizationsQuery.data ?? [],
    currentOrganizationId: currentOrganization?.id,
    isLoading:
      organizationsQuery.isLoading || focusedMembership.isLoading,
    isSwitching: updateFocusedMembership.isPending,
    switchOrganization,
  }
}
