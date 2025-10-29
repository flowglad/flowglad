import { trpc } from '@/app/_trpc/client'
import { encodeCursor } from '@/db/tableUtils'

export const useListUsageMetersQuery = (pricingModelId?: string) => {
  return trpc.usageMeters.list.useQuery({
    cursor: pricingModelId
      ? encodeCursor({
          parameters: {
            pricingModelId,
          },
          createdAt: new Date(0),
          direction: 'forward',
        })
      : undefined,
  })
}
