'use client'

import { useRouter } from 'next/navigation'
import { trpc } from '@/app/_trpc/client'
import { useAuthContext } from '@/contexts/authContext'

/**
 * Hook to manage organization list and switching.
 * Extracted from OrganizationSwitcher to be reusable in NavUser submenu.
 */
export const useOrganizationList = () => {
  const router = useRouter()
  const { organization: currentOrganization } = useAuthContext()
  const { invalidate: invalidateTRPC } = trpc.useUtils()

  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()

  const organizationsQuery =
    trpc.organizations.getOrganizations.useQuery()

  const updateFocusedMembership =
    trpc.organizations.updateFocusedMembership.useMutation({
      onSuccess: async () => {
        await invalidateTRPC()
        await focusedMembership.refetch()
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
