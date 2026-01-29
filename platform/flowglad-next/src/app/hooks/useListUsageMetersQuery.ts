import { encodeCursor } from '@db-core/tableUtils'
import { trpc } from '@/app/_trpc/client'

export const useListUsageMetersQuery = (pricingModelId?: string) => {
  return trpc.usageMeters.list.useQuery(
    {
      cursor: pricingModelId
        ? encodeCursor({
            parameters: {
              pricingModelId,
            },
            createdAt: new Date(0),
            direction: 'forward',
          })
        : undefined,
      limit: 100,
    },
    {
      refetchOnMount: 'always',
      staleTime: 0,
    }
  )
}
