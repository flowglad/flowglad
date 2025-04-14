import { Tab } from '@/components/ion/Tab'
import { PaymentStatus } from '@/types'
import { usePaymentCountsByStatusMap } from '../hooks/usePaymentCountsByStatusMap'
import { FallbackSkeleton } from '@/components/ion/Skeleton'
import { sentenceCase } from 'change-case'

interface PaymentsTabProps {
  status: PaymentStatus | 'all'
  isActive: boolean
}

export const PaymentsTab = ({
  status,
  isActive,
}: PaymentsTabProps) => {
  const { isLoading, getCountForStatus } =
    usePaymentCountsByStatusMap()
  const count = getCountForStatus(status)
  const label = status === 'all' ? 'All' : sentenceCase(status)

  return (
    <Tab value={status} state={isActive ? 'selected' : 'default'}>
      <div className="flex items-center gap-2">
        <FallbackSkeleton
          showSkeleton={isLoading}
          className="h-4 w-8"
        >
          <span className="font-bold">{count}</span>
        </FallbackSkeleton>
        <span>{label}</span>
      </div>
    </Tab>
  )
}
