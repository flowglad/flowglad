import { trpc } from '@/app/_trpc/client'
import { SubscriptionStatus } from '@/types'

export const useSubscriptionCountsByStatusMap = () => {
  const { data: countsData, isLoading } =
    trpc.subscriptions.getCountsByStatus.useQuery({})

  const countsByStatus = countsData || []
  const countsByStatusMap = new Map(
    countsByStatus.map((item) => [item.status, item.count])
  )

  const getTotalCount = () =>
    countsByStatus.reduce((sum, item) => sum + item.count, 0)

  const getCountForStatus = (status: SubscriptionStatus | 'all') => {
    if (status === 'all') {
      return getTotalCount()
    }
    return countsByStatusMap.get(status) || 0
  }

  return {
    isLoading,
    getCountForStatus,
    getTotalCount,
  }
}
