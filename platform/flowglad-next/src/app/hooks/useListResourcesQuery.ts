import { trpc } from '@/app/_trpc/client'

export const useListResourcesQuery = (pricingModelId?: string) => {
  return trpc.resources.list.useQuery(
    {
      pricingModelId: pricingModelId ?? '',
    },
    {
      refetchOnMount: 'always',
      staleTime: 0,
      enabled: !!pricingModelId,
    }
  )
}
