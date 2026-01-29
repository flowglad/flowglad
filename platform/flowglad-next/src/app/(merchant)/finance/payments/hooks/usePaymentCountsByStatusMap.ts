import type { PaymentStatus } from '@db-core/enums'
import { useMemo } from 'react'
import { trpc } from '@/app/_trpc/client'

export const usePaymentCountsByStatusMap = () => {
  const { data: countsByStatus, isLoading } =
    trpc.payments.getCountsByStatus.useQuery({})

  const countsByStatusMap = useMemo(() => {
    if (!countsByStatus)
      return new Map<PaymentStatus | 'all', number>()

    const map = new Map<PaymentStatus | 'all', number>()

    // Add counts for each status
    countsByStatus.forEach(({ status, count }) => {
      map.set(status, count)
    })

    // Calculate and add total count
    const totalCount = countsByStatus.reduce(
      (acc, { count }) => acc + count,
      0
    )
    map.set('all', totalCount)

    return map
  }, [countsByStatus])

  const getCountForStatus = (status: PaymentStatus | 'all') => {
    return countsByStatusMap.get(status) || 0
  }

  return {
    isLoading,
    getCountForStatus,
    countsByStatusMap,
  }
}
