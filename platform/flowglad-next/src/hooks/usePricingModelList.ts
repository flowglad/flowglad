'use client'

import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useContextAwareNavigation } from '@/hooks/useContextAwareNavigation'

/**
 * Hook to manage pricing model list and switching.
 * Similar to useOrganizationList but for pricing models within the current organization.
 * Pricing models are sorted: livemode PMs first, then test mode PMs.
 */
export const usePricingModelList = () => {
  const router = useRouter()
  const { invalidate: invalidateTRPC } = trpc.useUtils()
  const { navigateToParentIfNeeded } = useContextAwareNavigation()

  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()

  // Fetch all pricing models for the current organization across both livemodes.
  // Uses getAllForSwitcher which bypasses RLS livemode check via adminTransaction,
  // but still scopes to the user's organization for security.
  const pricingModelsQuery =
    trpc.pricingModels.getAllForSwitcher.useQuery(undefined, {
      enabled: !!focusedMembership.data?.organization,
    })

  // Sort pricing models: livemode first, then test mode
  const sortedPricingModels = useMemo(() => {
    const pms = pricingModelsQuery.data?.items ?? []
    return [...pms].sort((a, b) => {
      // First sort by livemode (true comes before false)
      if (a.pricingModel.livemode !== b.pricingModel.livemode) {
        return a.pricingModel.livemode ? -1 : 1
      }
      // Then sort by name within each group
      return a.pricingModel.name.localeCompare(b.pricingModel.name)
    })
  }, [pricingModelsQuery.data?.items])

  const updateFocusedPricingModel =
    trpc.organizations.updateFocusedPricingModel.useMutation({
      onSuccess: async () => {
        await invalidateTRPC()
        await focusedMembership.refetch()
        // Navigate to parent page if on a detail page to avoid 404s after PM switch
        // Only refresh if staying on current page (navigation handles its own refresh)
        if (!navigateToParentIfNeeded()) {
          router.refresh()
        }
      },
    })

  const switchPricingModel = async (pricingModelId: string) => {
    const currentPricingModelId =
      focusedMembership.data?.pricingModel?.id
    if (pricingModelId !== currentPricingModelId) {
      await updateFocusedPricingModel.mutateAsync({
        pricingModelId,
      })
    }
  }

  return {
    pricingModels: sortedPricingModels,
    currentPricingModelId: focusedMembership.data?.pricingModel?.id,
    currentPricingModel: focusedMembership.data?.pricingModel,
    isLoading:
      pricingModelsQuery.isLoading || focusedMembership.isLoading,
    isSwitching: updateFocusedPricingModel.isPending,
    switchPricingModel,
  }
}
