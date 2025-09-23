import { trpc } from '@/app/_trpc/client'

export const useProductCountsByStatusMap = () => {
  const { data: countsData, isLoading } =
    trpc.products.getCountsByStatus.useQuery({})

  const countsByStatus = countsData || []
  const countsByStatusMap = new Map(
    countsByStatus.map((item) => [item.status, item.count])
  )

  const getTotalCount = () =>
    countsByStatus.reduce((sum, item) => sum + item.count, 0)

  const getCountForStatus = (
    status: 'all' | 'active' | 'inactive'
  ) => {
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
