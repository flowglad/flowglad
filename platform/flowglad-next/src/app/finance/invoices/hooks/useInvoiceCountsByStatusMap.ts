import { useMemo } from 'react'
import { trpc } from '@/app/_trpc/client'
import type { InvoiceStatus } from '@/types'

export const useInvoiceCountsByStatusMap = () => {
  const { data, isLoading } =
    trpc.invoices.getCountsByStatus.useQuery({})

  const countsByStatusMap = useMemo(() => {
    if (!data) return new Map<InvoiceStatus | 'all', number>()

    const map = new Map<InvoiceStatus | 'all', number>()

    // Add counts for each status
    data.forEach(({ status, count }) => {
      map.set(status, count)
    })

    // Calculate total count for 'all'
    const totalCount = data.reduce((sum, { count }) => sum + count, 0)
    map.set('all', totalCount)

    return map
  }, [data])

  const getCountForStatus = (status: InvoiceStatus | 'all') => {
    return countsByStatusMap.get(status) || 0
  }

  return {
    isLoading,
    getCountForStatus,
    countsByStatusMap,
  }
}
