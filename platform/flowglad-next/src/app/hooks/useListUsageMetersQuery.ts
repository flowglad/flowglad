import { useMemo } from 'react'
import { trpc } from '@/app/_trpc/client'

export const useListUsageMetersQuery = () => {
  const firstPage = trpc.usageMeters.list.useQuery(
    { limit: 100 },
    { refetchOnMount: 'always', staleTime: 0 }
  )

  const nextPage = trpc.usageMeters.list.useQuery(
    { limit: 100, cursor: firstPage.data?.nextCursor },
    {
      enabled: !!firstPage.data?.hasMore,
      refetchOnMount: 'always',
      staleTime: 0,
    }
  )

  const data = useMemo(() => {
    if (!firstPage.data) return undefined
    const allData = [...firstPage.data.data]
    if (firstPage.data.hasMore && nextPage.data) {
      allData.push(...nextPage.data.data)
    }
    return {
      ...firstPage.data,
      data: allData,
      hasMore: nextPage.data?.hasMore ?? firstPage.data.hasMore,
    }
  }, [firstPage.data, nextPage.data])

  return {
    data,
    isLoading:
      firstPage.isLoading ||
      (!!firstPage.data?.hasMore && nextPage.isLoading),
  }
}
